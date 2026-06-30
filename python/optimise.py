"""
PEP Delivery — VRP Optimisation Microservice
Runs alongside your Node.js server on port 8000.

Install:  pip install fastapi uvicorn ortools
Run:      python optimise.py

Cost functions:
  minimize_time       — minimise total road travel time across all vans (default)
  minimize_distance   — minimise total road distance across all vans (requires distance_matrix)
  minimize_vans       — pack stops into as few vans as possible
  balance_routes      — spread work evenly so all drivers finish at the same time
  minimize_longest    — minimise the single longest individual route
  time_and_fewer_vans — balance between travel time and using fewer vans
"""

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
import httpx
import json
import tempfile
import os

app = FastAPI(title="PEP Route Optimiser")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────────────

class Stop(BaseModel):
    id: float           # customer id (floats — app uses timestamp ids)
    lat: float
    lng: float
    trolleys: int = 0   # number of trolleys for this customer

class VanConfig(BaseModel):
    id: int
    maxTrolleys: int   = 17    # max trolleys this van can carry per run
    maxStops:    int   = 15    # max delivery stops per run
    maxDistance: float = 200   # max road distance (km) per run — enforced when distance_matrix provided

class OptimiseRequest(BaseModel):
    stops:            List[Stop]
    vans:             List[VanConfig]
    duration_matrix:  List[List[float]]          # minutes, index 0 = warehouse depot
    distance_matrix:  Optional[List[List[float]]] = None  # km, index 0 = depot (used for minimize_distance and max distance constraint)
    cost_function:    str = 'minimize_time'       # see module docstring for options
    drop_penalty:     int = 10_000_000            # cost added per dropped (unserviceable) stop
    time_limit_seconds: int = 30                  # solver wall-clock time budget


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "PEP Route Optimiser"}


# ── Main optimisation endpoint ─────────────────────────────────────────────────

@app.post("/optimise")
def optimise(req: OptimiseRequest):
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp

    n_stops = len(req.stops)
    n_vans  = len(req.vans)

    if n_stops == 0:
        return {"routes": {}, "total_duration": 0, "success": True, "message": "No stops"}

    # Node 0 = warehouse depot, nodes 1..n = delivery stops
    n_nodes = n_stops + 1

    # OR-Tools needs integer costs — convert minutes → seconds
    time_matrix = [
        [int(req.duration_matrix[i][j] * 60) for j in range(n_nodes)]
        for i in range(n_nodes)
    ]

    # Distance matrix in metres (for minimize_distance arc cost and max-distance constraint)
    dist_matrix = None
    if req.distance_matrix:
        dist_matrix = [
            [int(req.distance_matrix[i][j] * 1000) for j in range(n_nodes)]
            for i in range(n_nodes)
        ]

    # ── Routing model ──────────────────────────────────────────────────────────
    manager = pywrapcp.RoutingIndexManager(n_nodes, n_vans, 0)  # depot = node 0
    routing = pywrapcp.RoutingModel(manager)

    # Travel time callback (always registered — needed for Time dimension)
    def time_callback(from_idx, to_idx):
        return time_matrix[manager.IndexToNode(from_idx)][manager.IndexToNode(to_idx)]
    transit_cb = routing.RegisterTransitCallback(time_callback)

    # ── Arc cost evaluator — chosen by cost_function ───────────────────────────
    if req.cost_function == 'minimize_distance' and dist_matrix:
        def dist_callback(from_idx, to_idx):
            return dist_matrix[manager.IndexToNode(from_idx)][manager.IndexToNode(to_idx)]
        arc_cb = routing.RegisterTransitCallback(dist_callback)
        print(f"[VRP] Cost function: minimize_distance")
    else:
        arc_cb = transit_cb
        print(f"[VRP] Cost function: {req.cost_function}")

    routing.SetArcCostEvaluatorOfAllVehicles(arc_cb)

    # Fixed cost per vehicle — used by minimize_vans and time_and_fewer_vans.
    # Only charged when a vehicle actually serves at least one stop.
    if req.cost_function == 'minimize_vans':
        # Very high fixed cost (~55 hrs) — solver packs into fewest vans possible
        routing.SetFixedCostOfAllVehicles(200_000)
    elif req.cost_function == 'time_and_fewer_vans':
        # Moderate fixed cost (~5.5 hrs) — balance between time efficiency and van count
        routing.SetFixedCostOfAllVehicles(20_000)

    # ── Time dimension — delivery window 07:45 → 16:45 (9 hours = 32 400 s) ───
    DELIVERY_WINDOW_SECONDS = 9 * 3600
    routing.AddDimension(transit_cb, 0, DELIVERY_WINDOW_SECONDS, True, "Time")
    time_dim = routing.GetDimensionOrDie("Time")

    # Span-based cost modifiers — applied after Time dimension is created
    if req.cost_function == 'balance_routes':
        # Penalise each vehicle's individual route span (end − start).
        # Drives all drivers to have roughly equal route lengths.
        time_dim.SetSpanCostCoefficientForAllVehicles(100)

    elif req.cost_function == 'minimize_longest':
        # Penalise the global span (latest finish − earliest start across all vans).
        # Drives the solver to compress all routes so no single van runs excessively long.
        time_dim.SetGlobalSpanCostCoefficient(1000)

    # ── Trolley capacity dimension ─────────────────────────────────────────────
    def demand_callback(from_idx):
        node = manager.IndexToNode(from_idx)
        return 0 if node == 0 else req.stops[node - 1].trolleys

    demand_cb = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_cb,
        0,
        [v.maxTrolleys for v in req.vans],
        True,
        "Capacity"
    )

    # ── Stop count dimension ───────────────────────────────────────────────────
    def one_callback(from_idx):
        return 0 if manager.IndexToNode(from_idx) == 0 else 1

    one_cb = routing.RegisterUnaryTransitCallback(one_callback)
    routing.AddDimensionWithVehicleCapacity(
        one_cb,
        0,
        [v.maxStops for v in req.vans],
        True,
        "Stops"
    )

    # ── Max distance dimension — only when distance_matrix is provided ─────────
    if dist_matrix and any(v.maxDistance < 99_999 for v in req.vans):
        def dist_dim_callback(from_idx, to_idx):
            return dist_matrix[manager.IndexToNode(from_idx)][manager.IndexToNode(to_idx)]
        dist_dim_cb = routing.RegisterTransitCallback(dist_dim_callback)
        routing.AddDimensionWithVehicleCapacity(
            dist_dim_cb,
            0,
            [int(v.maxDistance * 1000) for v in req.vans],  # km → metres
            True,
            "Distance"
        )

    # ── Drop penalty — added per unserviceable stop ────────────────────────────
    for node in range(1, n_nodes):
        routing.AddDisjunction([manager.NodeToIndex(node)], req.drop_penalty)

    # ── Search parameters ──────────────────────────────────────────────────────
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = req.time_limit_seconds

    print(f"[VRP] {n_stops} stops | {n_vans} vans | window 07:45-16:45 | {req.time_limit_seconds}s limit | drop_penalty={req.drop_penalty}")

    solution = routing.SolveWithParameters(params)

    if not solution:
        return {
            "routes": {},
            "total_duration": 0,
            "success": False,
            "message": "OR-Tools could not find a feasible solution"
        }

    # ── Extract routes ─────────────────────────────────────────────────────────
    routes:  Dict[str, List[int]] = {}
    dropped: List[int] = []
    served = set()

    for v_idx, van in enumerate(req.vans):
        route_ids = []
        index = routing.Start(v_idx)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:
                served.add(node)
                route_ids.append(req.stops[node - 1].id)
            index = solution.Value(routing.NextVar(index))
        if route_ids:
            routes[str(van.id)] = route_ids

    for node in range(1, n_nodes):
        if node not in served:
            dropped.append(req.stops[node - 1].id)

    total_seconds = solution.ObjectiveValue()

    return {
        "routes":         routes,
        "total_duration": round(total_seconds / 60, 1),
        "dropped":        dropped,
        "success":        True,
        "message":        f"Optimised {n_stops} stops across {len(routes)} vans ({req.cost_function})"
    }


# ── AI Chat — llama-server (llama.cpp binary, no Ollama needed) ───────────────

LLAMA_SERVER_URL = "http://localhost:8080"   # llama-server runs on this port

DISPATCHER_SYSTEM_PROMPT = """You are a delivery dispatch assistant for PEP Delivery.
All facts you may use are in the "=== LIVE DATA ===" block sent with each message.

Rules:
1. Only state facts that appear in the LIVE DATA block. Never invent names, numbers, or order details.
2. If something is not in the LIVE DATA block, say "I don't have that information."
3. Do not claim to look up, query, or access anything — all data is already given to you.
4. Be concise and practical."""

class ChatMessage(BaseModel):
    role: str      # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[str] = None
    model: str = "llama3.2:3b"


# ── Chat status ────────────────────────────────────────────────────────────────

@app.get("/chat/status")
async def chat_status():
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{LLAMA_SERVER_URL}/health")
            ok   = resp.json().get("status") == "ok"
            return {"available": ok, "models": ["llama3.2:3b"] if ok else [], "gemma_ready": ok}
    except Exception:
        return {"available": False, "models": [], "gemma_ready": False}


# ── Chat endpoint (streaming) ──────────────────────────────────────────────────

@app.post("/chat")
async def chat(req: ChatRequest):
    system_content = DISPATCHER_SYSTEM_PROMPT
    if req.context:
        system_content += f"\n\n{req.context}"

    messages = [{"role": "system", "content": system_content}]
    for msg in req.messages:
        if msg.role in ("user", "assistant"):
            messages.append({"role": msg.role, "content": msg.content})

    async def token_stream():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{LLAMA_SERVER_URL}/v1/chat/completions",
                    json={
                        "model":          "llama3.2:3b",
                        "messages":       messages,
                        "stream":         True,
                        "max_tokens":     750,
                        "temperature":    0.1,
                        "repeat_penalty": 1.1
                    }
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if raw == "[DONE]":
                            yield json.dumps({"t": "", "d": True}) + "\n"
                            break
                        try:
                            data  = json.loads(raw)
                            token = data["choices"][0]["delta"].get("content", "")
                            done  = data["choices"][0].get("finish_reason") is not None
                            yield json.dumps({"t": token, "d": done}) + "\n"
                            if done:
                                break
                        except Exception:
                            pass
        except httpx.ConnectError:
            yield json.dumps({"t": "Llama server is not running. Start it via start.bat.", "d": True}) + "\n"
        except Exception as e:
            yield json.dumps({"t": f"AI error: {str(e)}", "d": True}) + "\n"

    return StreamingResponse(token_stream(), media_type="text/plain")


# ── Speech transcription (local Whisper) ──────────────────────────────────────

_whisper_model = None  # loaded lazily on first use

def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        print("[Whisper] Loading 'base' model — downloading on first use (~145 MB)…")
        _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        print("[Whisper] Model ready.")
    return _whisper_model

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    tmp_path = None
    try:
        content = await file.read()
        print(f"[Whisper] Received audio: {len(content)} bytes, type={file.content_type}")
        suffix  = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        model = _get_whisper()
        segments, info = model.transcribe(tmp_path, language="en", beam_size=1)
        text  = " ".join(s.text.strip() for s in segments).strip()
        print(f"[Whisper] Transcribed ({info.language}): {text!r}")
        return {"text": text}

    except Exception as e:
        import traceback
        print(f"[Whisper] ERROR: {e}")
        traceback.print_exc()
        status = 503 if "not installed" in str(e).lower() else 500
        return JSONResponse(status_code=status, content={"text": "", "error": str(e)})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except: pass


if __name__ == "__main__":
    print("PEP Route Optimiser starting on http://localhost:8000")
    print("Health check: http://localhost:8000/health")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
