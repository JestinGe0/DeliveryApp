// ========== GAMIFICATION SYSTEM ==========

// Achievement definitions
const ACHIEVEMENTS = {
    // Speed demons
    'SPEED_DEMON_1': { id: 'SPEED_DEMON_1', name: 'Speed Demon I', description: 'Complete 10 orders with picking time under 15 minutes', icon: 'fa-bolt', color: '#f59e0b', threshold: 10, metric: 'fastPicks' },
    'SPEED_DEMON_2': { id: 'SPEED_DEMON_2', name: 'Speed Demon II', description: 'Complete 50 orders with picking time under 15 minutes', icon: 'fa-bolt', color: '#f59e0b', threshold: 50, metric: 'fastPicks' },
    'SPEED_DEMON_3': { id: 'SPEED_DEMON_3', name: 'Speed Demon III', description: 'Complete 100 orders with picking time under 15 minutes', icon: 'fa-bolt', color: '#f59e0b', threshold: 100, metric: 'fastPicks' },
    
    // Plant masters
    'PLANT_MASTER_1': { id: 'PLANT_MASTER_1', name: 'Plant Master I', description: 'Pick 1,000 plants total', icon: 'fa-seedling', color: '#10b981', threshold: 1000, metric: 'totalPlants' },
    'PLANT_MASTER_2': { id: 'PLANT_MASTER_2', name: 'Plant Master II', description: 'Pick 5,000 plants total', icon: 'fa-seedling', color: '#10b981', threshold: 5000, metric: 'totalPlants' },
    'PLANT_MASTER_3': { id: 'PLANT_MASTER_3', name: 'Plant Master III', description: 'Pick 10,000 plants total', icon: 'fa-seedling', color: '#10b981', threshold: 10000, metric: 'totalPlants' },
    
    // Perfect record
    'PERFECT_WEEK': { id: 'PERFECT_WEEK', name: 'Perfect Week', description: 'Complete all orders on time for an entire week', icon: 'fa-star', color: '#fbbf24', threshold: 1, metric: 'perfectWeeks' },
    'PERFECT_MONTH': { id: 'PERFECT_MONTH', name: 'Perfect Month', description: 'Complete all orders on time for an entire month', icon: 'fa-crown', color: '#fbbf24', threshold: 1, metric: 'perfectMonths' },
    
    // Reliability
    'IRON_MAN_1': { id: 'IRON_MAN_1', name: 'Iron Man I', description: 'Work 30 days without a sick day', icon: 'fa-shield', color: '#6b7280', threshold: 30, metric: 'consecutiveDays' },
    'IRON_MAN_2': { id: 'IRON_MAN_2', name: 'Iron Man II', description: 'Work 90 days without a sick day', icon: 'fa-shield', color: '#6b7280', threshold: 90, metric: 'consecutiveDays' },
    'IRON_MAN_3': { id: 'IRON_MAN_3', name: 'Iron Man III', description: 'Work 365 days without a sick day', icon: 'fa-shield', color: '#6b7280', threshold: 365, metric: 'consecutiveDays' },
    
    // Quality
    'QUALITY_CHAMP_1': { id: 'QUALITY_CHAMP_1', name: 'Quality Champion I', description: '50 orders with zero quality issues', icon: 'fa-check-circle', color: '#16a34a', threshold: 50, metric: 'qualityOrders' },
    'QUALITY_CHAMP_2': { id: 'QUALITY_CHAMP_2', name: 'Quality Champion II', description: '200 orders with zero quality issues', icon: 'fa-check-circle', color: '#16a34a', threshold: 200, metric: 'qualityOrders' },
    'QUALITY_CHAMP_3': { id: 'QUALITY_CHAMP_3', name: 'Quality Champion III', description: '500 orders with zero quality issues', icon: 'fa-check-circle', color: '#16a34a', threshold: 500, metric: 'qualityOrders' },
    
    // Team player
    'TEAM_PLAYER': { id: 'TEAM_PLAYER', name: 'Team Player', description: 'Help complete 20 orders as part of a team', icon: 'fa-users', color: '#8b5cf6', threshold: 20, metric: 'teamOrders' },
    'MENTOR': { id: 'MENTOR', name: 'Mentor', description: 'Train 3 new staff members', icon: 'fa-chalkboard-teacher', color: '#8b5cf6', threshold: 3, metric: 'trainees' },
    
    // Driver specific
    'ROAD_WARRIOR_1': { id: 'ROAD_WARRIOR_1', name: 'Road Warrior I', description: 'Drive 1,000 km total', icon: 'fa-road', color: '#3b82f6', threshold: 1000, metric: 'totalDistance', type: 'driver' },
    'ROAD_WARRIOR_2': { id: 'ROAD_WARRIOR_2', name: 'Road Warrior II', description: 'Drive 5,000 km total', icon: 'fa-road', color: '#3b82f6', threshold: 5000, metric: 'totalDistance', type: 'driver' },
    'ROAD_WARRIOR_3': { id: 'ROAD_WARRIOR_3', name: 'Road Warrior III', description: 'Drive 10,000 km total', icon: 'fa-road', color: '#3b82f6', threshold: 10000, metric: 'totalDistance', type: 'driver' },
    
    // Early bird
    'EARLY_BIRD': { id: 'EARLY_BIRD', name: 'Early Bird', description: 'Start shift before 6 AM 10 times', icon: 'fa-sun', color: '#f59e0b', threshold: 10, metric: 'earlyStarts' },
    'NIGHT_OWL': { id: 'NIGHT_OWL', name: 'Night Owl', description: 'Work after 8 PM 10 times', icon: 'fa-moon', color: '#2563eb', threshold: 10, metric: 'lateEnds' }
};

// Challenge definitions
var CHALLENGES = {
    'TEAM_SPEED': { 
        id: 'TEAM_SPEED', 
        name: 'Team Speed Challenge', 
        description: 'Team with fastest average picking time this week',
        icon: 'fa-gauge-high',
        color: '#f59e0b',
        duration: 'weekly',
        metric: 'avgPickingTime'
    },
    'TEAM_VOLUME': { 
        id: 'TEAM_VOLUME', 
        name: 'Team Volume Challenge', 
        description: 'Team with most orders picked this week',
        icon: 'fa-boxes',
        color: '#10b981',
        duration: 'weekly',
        metric: 'orderCount'
    },
    'TEAM_PLANTS': { 
        id: 'TEAM_PLANTS', 
        name: 'Team Plants Challenge', 
        description: 'Team with most plants picked this week',
        icon: 'fa-seedling',
        color: '#16a34a',
        duration: 'weekly',
        metric: 'plantCount'
    },
    'TEAM_QUALITY': { 
        id: 'TEAM_QUALITY', 
        name: 'Team Quality Challenge', 
        description: 'Team with highest quality score this week',
        icon: 'fa-medal',
        color: '#8b5cf6',
        duration: 'weekly',
        metric: 'qualityScore'
    },
    'DRIVER_DISTANCE': { 
        id: 'DRIVER_DISTANCE', 
        name: 'Driver Distance Challenge', 
        description: 'Driver with most kilometers this month',
        icon: 'fa-tachometer-alt',
        color: '#3b82f6',
        duration: 'monthly',
        metric: 'distance',
        type: 'driver'
    },
    'DRIVER_EFFICIENCY': { 
        id: 'DRIVER_EFFICIENCY', 
        name: 'Driver Efficiency Challenge', 
        description: 'Driver with best fuel efficiency',
        icon: 'fa-gas-pump',
        color: '#10b981',
        duration: 'monthly',
        metric: 'fuelEfficiency',
        type: 'driver'
    }
};

// Monthly award definitions
var MONTHLY_AWARDS = {
    'MVP': { id: 'MVP', name: 'Most Valuable Player', description: 'Best overall performance this month', icon: 'fa-trophy', color: '#fbbf24' },
    'ROOKIE': { id: 'ROOKIE', name: 'Rookie of the Month', description: 'Best new starter (<3 months)', icon: 'fa-star', color: '#10b981' },
    'SPEEDSTER': { id: 'SPEEDSTER', name: 'Speedster of the Month', description: 'Fastest average picking time', icon: 'fa-bolt', color: '#f59e0b' },
    'IRON_WILL': { id: 'IRON_WILL', name: 'Iron Will Award', description: 'Perfect attendance', icon: 'fa-shield', color: '#6b7280' },
    'QUALITY_QUEEN': { id: 'QUALITY_QUEEN', name: 'Quality King/Queen', description: 'Highest quality score', icon: 'fa-crown', color: '#8b5cf6' },
    'PEOPLE_CHAMP': { id: 'PEOPLE_CHAMP', name: 'People\'s Champion', description: 'Voted by peers', icon: 'fa-heart', color: '#ec4899' }
};

// Staff gamification data storage
let staffGamification = {};

const GAMIFICATION_STORAGE_KEY = 'PEP_gamification';

// Load gamification data
function loadGamificationData() {
    try {
        const saved = localStorage.getItem(GAMIFICATION_STORAGE_KEY);
        if (saved) {
            staffGamification = JSON.parse(saved);
            console.log(`Loaded gamification data for ${Object.keys(staffGamification).length} staff members`);
        } else {
            initializeGamificationData();
        }
    } catch (e) {
        console.error('Error loading gamification data:', e);
        initializeGamificationData();
    }
}

// Initialize gamification data for all staff
function initializeGamificationData() {
    staffGamification = {};
    staffMembers.forEach(staff => {
        staffGamification[staff.id] = {
            staffId: staff.id,
            staffName: staff.name,
            staffType: staff.type,
            
            // Metrics
            totalOrders: 0,
            totalPlants: 0,
            fastPicks: 0,
            qualityOrders: 0,
            teamOrders: 0,
            consecutiveDays: 0,
            perfectWeeks: 0,
            perfectMonths: 0,
            earlyStarts: 0,
            lateEnds: 0,
            trainees: 0,
            
            // Driver specific
            totalDistance: 0,
            fuelEfficiency: 0,
            
            // Achievements earned
            achievements: [],
            
            // Challenge participation
            challenges: {},
            
            // Awards
            awards: [],
            
            // Last active date (for streak tracking)
            lastActiveDate: null,
            
            // Current streak
            currentStreak: 0,
            longestStreak: 0
        };
    });
    saveGamificationData();
}

// Save gamification data
function saveGamificationData() {
    try {
        localStorage.setItem(GAMIFICATION_STORAGE_KEY, JSON.stringify(staffGamification));
        
        // Send to server if connected
        if (socket && socket.connected) {
            socket.emit('update-gamification', staffGamification);
        }
    } catch (error) {
        console.error('Error saving gamification data:', error);
    }
}

// Update staff metrics based on order completion
function updateStaffMetrics(customer) {
    if (!customer || !customer.assignedStaff) return;
    
    const plantCount = parseInt(customer.passport?.numberOfPlants) || 0;
    const pickingDuration = customer.passport?.pickingMetrics?.pickingDuration || 0;
    const efficiencyScore = customer.passport?.pickingMetrics?.efficiencyScore || 0;
    
    customer.assignedStaff.forEach(staffId => {
        const staff = staffMembers.find(s => s.id === staffId);
        if (!staff) return;
        
        if (!staffGamification[staffId]) {
            // Initialize if not exists
            staffGamification[staffId] = {
                staffId: staffId,
                staffName: staff.name,
                staffType: staff.type,
                totalOrders: 0,
                totalPlants: 0,
                fastPicks: 0,
                qualityOrders: 0,
                teamOrders: 0,
                consecutiveDays: 0,
                perfectWeeks: 0,
                perfectMonths: 0,
                earlyStarts: 0,
                lateEnds: 0,
                trainees: 0,
                totalPickingDuration: 0,
                totalDistance: 0,
                fuelEfficiency: 0,
                achievements: [],
                challenges: {},
                awards: [],
                lastActiveDate: null,
                currentStreak: 0,
                longestStreak: 0
            };
        }
        
        const gam = staffGamification[staffId];
        
        // Update basic metrics
        gam.totalOrders++;
        gam.totalPlants += plantCount;
        gam.totalPickingDuration = (gam.totalPickingDuration || 0) + pickingDuration;
        
        // Fast pick (under 15 minutes)
        if (pickingDuration > 0 && pickingDuration < 15) {
            gam.fastPicks++;
        }
        
        // Quality order (efficiency > 90%)
        if (efficiencyScore > 90) {
            gam.qualityOrders++;
        }
        
        // Team order (more than 1 picker)
        if (customer.assignedStaff.length > 1) {
            gam.teamOrders++;
        }
        
        // Check for early start (before 6 AM)
        if (customer.passport?.timestamps?.pickingStarted) {
            const startHour = new Date(customer.passport.timestamps.pickingStarted).getHours();
            if (startHour < 6) {
                gam.earlyStarts++;
            }
            if (startHour > 20) {
                gam.lateEnds++;
            }
        }
        
        // Update streak
        const today = new Date().toDateString();
        if (gam.lastActiveDate !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (gam.lastActiveDate === yesterday.toDateString()) {
                gam.currentStreak++;
                if (gam.currentStreak > gam.longestStreak) {
                    gam.longestStreak = gam.currentStreak;
                }
            } else {
                gam.currentStreak = 1;
            }
            gam.lastActiveDate = today;
        }
        
        // Check for new achievements
        checkAchievements(staffId, gam);
    });
    
    saveGamificationData();
}

// Check and award achievements
function checkAchievements(staffId, gam) {
    const staff = staffMembers.find(s => s.id === staffId);
    if (!staff) return;
    
    const earnedAchievements = gam.achievements || [];
    let newAchievements = [];
    
    Object.values(ACHIEVEMENTS).forEach(achievement => {
        // Skip if already earned
        if (earnedAchievements.some(a => a.id === achievement.id)) return;
        
        // Skip if type-specific and doesn't match
        if (achievement.type && achievement.type !== staff.type) return;
        
        let earned = false;
        
        switch (achievement.metric) {
            case 'fastPicks':
                earned = gam.fastPicks >= achievement.threshold;
                break;
            case 'totalPlants':
                earned = gam.totalPlants >= achievement.threshold;
                break;
            case 'qualityOrders':
                earned = gam.qualityOrders >= achievement.threshold;
                break;
            case 'teamOrders':
                earned = gam.teamOrders >= achievement.threshold;
                break;
            case 'consecutiveDays':
                earned = gam.longestStreak >= achievement.threshold;
                break;
            case 'perfectWeeks':
                earned = gam.perfectWeeks >= achievement.threshold;
                break;
            case 'perfectMonths':
                earned = gam.perfectMonths >= achievement.threshold;
                break;
            case 'earlyStarts':
                earned = gam.earlyStarts >= achievement.threshold;
                break;
            case 'lateEnds':
                earned = gam.lateEnds >= achievement.threshold;
                break;
            case 'trainees':
                earned = gam.trainees >= achievement.threshold;
                break;
            case 'totalDistance':
                earned = gam.totalDistance >= achievement.threshold;
                break;
        }
        
        if (earned) {
            const newAchievement = {
                ...achievement,
                earnedDate: new Date().toISOString()
            };
            earnedAchievements.push(newAchievement);
            newAchievements.push(newAchievement);
            
            // Show notification
            showNotification(`🏆 ${staff.name} earned: ${achievement.name}!`, 'success');
        }
    });
    
    gam.achievements = earnedAchievements;
    
    return newAchievements;
}

// Calculate leaderboard rankings
function calculateLeaderboard(metric, type = 'all', dateRange = 'all') {
    let filteredStaff = staffMembers;
    
    // Filter by type
    if (type !== 'all') {
        filteredStaff = staffMembers.filter(s => s.type === type);
    }
    
    // Build leaderboard entries
    const leaderboard = filteredStaff.map(staff => {
        const gam = staffGamification[staff.id] || {};
        let score = 0;
        let value = 0;
        
        switch (metric) {
            case 'orders':
                value = gam.totalOrders || 0;
                break;
            case 'plants':
                value = gam.totalPlants || 0;
                break;
            case 'speed':
                // Average picking time (lower is better)
                const totalDuration = gam.totalPickingDuration || 0;
                const orderCount = gam.totalOrders || 0;
                value = orderCount > 0 ? Math.round(totalDuration / orderCount) : 0;
                score = -value; // Negative so lower times rank higher
                break;
            case 'efficiency':
                value = gam.avgEfficiency || 0;
                break;
            case 'streak':
                value = gam.currentStreak || 0;
                break;
            case 'achievements':
                value = (gam.achievements || []).length;
                break;
            case 'distance':
                value = Math.round(gam.totalDistance || 0);
                break;
        }
        
        return {
            staffId: staff.id,
            name: staff.name,
            type: staff.type,
            value,
            score: score || value,
            achievements: (gam.achievements || []).length,
            avatar: staff.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
        };
    });
    
    // Sort by score (descending, except for speed which uses negative score)
    leaderboard.sort((a, b) => b.score - a.score);
    
    return leaderboard;
}

// Calculate team challenge standings
function calculateChallengeStandings(challengeId) {
    const challenge = CHALLENGES[challengeId];
    if (!challenge) return [];
    
    // Group staff by van/team
    const teams = {};
    
    // Initialize teams only if VANS exists and has length
    if (VANS && VANS.length > 0) {
        VANS.forEach(van => {
            teams[van.id] = {
                vanId: van.id,
                vanName: van.name,
                color: van.color,
                members: [],
                totalOrders: 0,
                totalPlants: 0,
                totalPickingTime: 0,
                totalDistance: 0,
                qualityScore: 0
            };
        });
    } else {
        // Fallback if VANS is not defined
        return [];
    }
    
    // Add staff to their teams based on van preference or assignment
    if (staffMembers && staffMembers.length > 0) {
        staffMembers.forEach(staff => {
            if (staff && staff.type === 'driver' && staff.vehiclePreference) {
                const vanId = VANS.find(v => v.name === staff.vehiclePreference)?.id;
                if (vanId && teams[vanId]) {
                    teams[vanId].members.push(staff.id);
                }
            } else if (staff && staff.id) {
                // For pickers, distribute evenly or use default
                const vanId = (staff.id % Object.keys(teams).length) + 1;
                if (teams[vanId]) {
                    teams[vanId].members.push(staff.id);
                }
            }
        });
    }
    
    // Calculate metrics for each team
    Object.values(teams).forEach(team => {
        if (team && team.members && team.members.length > 0) {
            team.members.forEach(staffId => {
                const gam = staffGamification[staffId] || {};
                
                switch (challenge.metric) {
                    case 'orderCount':
                        team.totalOrders += gam.totalOrders || 0;
                        break;
                    case 'plantCount':
                        team.totalPlants += gam.totalPlants || 0;
                        break;
                    case 'avgPickingTime':
                        team.totalPickingTime += gam.totalPickingDuration || 0;
                        break;
                    case 'distance':
                        team.totalDistance += gam.totalDistance || 0;
                        break;
                }
            });
            
            // Calculate averages
            if (challenge.metric === 'avgPickingTime' && team.members.length > 0) {
                team.value = Math.round(team.totalPickingTime / team.members.length);
            } else {
                team.value = team.totalOrders || team.totalPlants || team.totalDistance || 0;
            }
        } else {
            team.value = 0;
        }
    });
    
    // Sort by value (descending)
    return Object.values(teams).sort((a, b) => b.value - a.value);
}

// Get monthly award nominees
function getMonthlyAwardNominees(awardId, month, year) {
    const award = MONTHLY_AWARDS[awardId];
    if (!award) return [];
    
    let nominees = [];
    
    switch (awardId) {
        case 'MVP':
            nominees = staffMembers.map(staff => {
                const gam = staffGamification[staff.id] || {};
                const score = (gam.totalOrders || 0) * 2 + 
                             (gam.totalPlants || 0) / 10 + 
                             (gam.qualityOrders || 0) * 5;
                return {
                    staffId: staff.id,
                    name: staff.name,
                    type: staff.type,
                    score,
                    metrics: {
                        orders: gam.totalOrders || 0,
                        plants: gam.totalPlants || 0,
                        quality: gam.qualityOrders || 0
                    }
                };
            }).sort((a, b) => b.score - a.score).slice(0, 5);
            break;
            
        case 'SPEEDSTER':
            nominees = staffMembers.map(staff => {
                const gam = staffGamification[staff.id] || {};
                const avgTime = gam.totalOrders ? 
                    Math.round((gam.totalPickingDuration || 0) / gam.totalOrders) : 999;
                return {
                    staffId: staff.id,
                    name: staff.name,
                    type: staff.type,
                    score: -avgTime,
                    value: avgTime
                };
            }).sort((a, b) => a.value - b.value).slice(0, 5);
            break;
            
        case 'IRON_WILL':
            nominees = staffMembers.map(staff => {
                const gam = staffGamification[staff.id] || {};
                return {
                    staffId: staff.id,
                    name: staff.name,
                    type: staff.type,
                    score: gam.currentStreak || 0,
                    value: gam.currentStreak || 0
                };
            }).sort((a, b) => b.score - a.score).slice(0, 5);
            break;
            
        case 'QUALITY_QUEEN':
            nominees = staffMembers.map(staff => {
                const gam = staffGamification[staff.id] || {};
                const qualityRate = gam.totalOrders ? 
                    Math.round(((gam.qualityOrders || 0) / gam.totalOrders) * 100) : 0;
                return {
                    staffId: staff.id,
                    name: staff.name,
                    type: staff.type,
                    score: qualityRate,
                    value: qualityRate
                };
            }).sort((a, b) => b.score - a.score).slice(0, 5);
            break;
    }
    
    return nominees;
}

// ========== GAMIFICATION PAGE FUNCTIONS ==========

let pageGamificationCharts = {};

function refreshGamificationPage() {
    try {
        refreshPageLeaderboard();
    } catch(e) { console.error('Error refreshing leaderboard:', e); }
    
    try {
        refreshPageAchievements();
    } catch(e) { console.error('Error refreshing achievements:', e); }
    
    try {
        refreshPageChallenges();
    } catch(e) { console.error('Error refreshing challenges:', e); }
    
    try {
        refreshPageAwards();
    } catch(e) { console.error('Error refreshing awards:', e); }
    
    try {
        refreshPageMyStats();
    } catch(e) { console.error('Error refreshing my stats:', e); }
}

function refreshPageLeaderboard() {
    const metric = document.getElementById('pageLeaderboardMetric')?.value || 'orders';
    const type = document.getElementById('pageLeaderboardType')?.value || 'all';
    const period = document.getElementById('pageLeaderboardPeriod')?.value || 'all';
    
    const leaderboard = calculateLeaderboard(metric, type, period);
    
    // Update podium
    if (leaderboard.length > 0) {
        updatePagePodiumPlace(leaderboard[0], 'first');
    }
    if (leaderboard.length > 1) {
        updatePagePodiumPlace(leaderboard[1], 'second');
    }
    if (leaderboard.length > 2) {
        updatePagePodiumPlace(leaderboard[2], 'third');
    }
    
    // Update table
    const tbody = document.getElementById('pageLeaderboardBody');
    if (!tbody) return;
    
    tbody.innerHTML = leaderboard.map((entry, index) => {
        let rankClass = '';
        if (index === 0) rankClass = 'gold';
        else if (index === 1) rankClass = 'silver';
        else if (index === 2) rankClass = 'bronze';
        
        let valueDisplay = entry.value;
        if (metric === 'speed') valueDisplay = `${entry.value} min`;
        else if (metric === 'distance') valueDisplay = `${entry.value} km`;
        else if (metric === 'efficiency') valueDisplay = `${entry.value}%`;
        
        return `
            <tr>
                <td><span class="rank-badge ${rankClass}">${index + 1}</span></td>
                <td>
                    <span class="staff-avatar-small ${entry.type}">${entry.avatar}</span>
                    ${entry.name}
                </td>
                <td>${entry.type === 'picker' ? '👥 Picker' : '🚚 Driver'}</td>
                <td><strong>${valueDisplay}</strong></td>
                <td>${entry.achievements}</td>
                <td class="trend-neutral">→</td>
            </tr>
        `;
    }).join('');
}

function updatePagePodiumPlace(entry, place) {
    document.getElementById(`page${place.charAt(0).toUpperCase() + place.slice(1)}PlaceName`).textContent = entry.name;
    document.getElementById(`page${place.charAt(0).toUpperCase() + place.slice(1)}PlaceAvatar`).textContent = entry.avatar;
    
    const metric = document.getElementById('pageLeaderboardMetric')?.value || 'orders';
    let valueDisplay = entry.value;
    if (metric === 'speed') valueDisplay = `${entry.value} min`;
    else if (metric === 'distance') valueDisplay = `${entry.value} km`;
    else if (metric === 'efficiency') valueDisplay = `${entry.value}%`;
    
    document.getElementById(`page${place.charAt(0).toUpperCase() + place.slice(1)}PlaceValue`).textContent = valueDisplay;
}

function refreshPageAchievements() {
    const filter = document.getElementById('pageAchievementFilter')?.value || 'all';
    const staffId = 1; // Replace with current user ID
    
    const gam = staffGamification[staffId] || { achievements: [] };
    const earnedIds = gam.achievements.map(a => a.id);
    
    const grid = document.getElementById('pageAchievementsGrid');
    if (!grid) return;
    
    let achievementsList = Object.values(ACHIEVEMENTS);
    
    if (filter === 'earned') {
        achievementsList = achievementsList.filter(a => earnedIds.includes(a.id));
    } else if (filter === 'locked') {
        achievementsList = achievementsList.filter(a => !earnedIds.includes(a.id));
    }
    
    grid.innerHTML = achievementsList.map(achievement => {
        const earned = gam.achievements.find(a => a.id === achievement.id);
        const earnedClass = earned ? 'earned' : 'locked';
        const earnedDate = earned ? new Date(earned.earnedDate).toLocaleDateString() : '';
        
        return `
            <div class="achievement-card ${earnedClass}">
                <div class="achievement-icon" style="background: ${achievement.color}">
                    <i class="fas ${achievement.icon}"></i>
                </div>
                <div class="achievement-info">
                    <div class="achievement-name">
                        ${achievement.name}
                        ${earned ? '<i class="fas fa-check-circle" style="color: #10b981;"></i>' : ''}
                    </div>
                    <div class="achievement-description">${achievement.description}</div>
                    ${earned ? 
                        `<div class="achievement-date">Earned: ${earnedDate}</div>` : 
                        `<div class="achievement-locked">Progress: ${gam[achievement.metric] || 0}/${achievement.threshold}</div>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// Switch page tabs (for gamification and ROI pages)
function switchPageTab(page, tabName) {
    // Prevent default if event exists
    if (event) {
        event.preventDefault();
    }
    
    // Update tabs - with null checks
    const tabs = document.querySelectorAll(`#screen-${page} .page-tab`);
    if (tabs && tabs.length > 0) {
        tabs.forEach(t => t.classList.remove('active'));
    }
    
    // Add active class to clicked tab
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Hide all tab contents - with null checks
    const tabContents = document.querySelectorAll(`#screen-${page} .page-tab-content`);
    if (tabContents && tabContents.length > 0) {
        tabContents.forEach(c => c.classList.remove('active'));
    }
    
    // Show selected tab - with null check
    const selectedTab = document.getElementById(`${page}-${tabName}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Refresh tab data with null checks
    if (page === 'gamification') {
        switch(tabName) {
            case 'leaderboard': 
                if (typeof refreshPageLeaderboard === 'function') refreshPageLeaderboard(); 
                break;
            case 'achievements': 
                if (typeof refreshPageAchievements === 'function') refreshPageAchievements(); 
                break;
            case 'challenges': 
                if (typeof refreshPageChallenges === 'function') refreshPageChallenges(); 
                break;
            case 'awards': 
                if (typeof refreshPageAwards === 'function') refreshPageAwards(); 
                break;
            case 'my-stats': 
                if (typeof refreshPageMyStats === 'function') refreshPageMyStats(); 
                break;
        }
    } else if (page === 'roi') {
        switch(tabName) {
            case 'customers': 
                if (typeof refreshPageROICustomers === 'function') refreshPageROICustomers(); 
                break;
            case 'zones': 
                if (typeof refreshPageROIZones === 'function') refreshPageROIZones(); 
                break;
            case 'trends': 
                if (typeof refreshPageROITrends === 'function') refreshPageROITrends(); 
                break;
            case 'projections': 
                if (typeof refreshPageROIProjections === 'function') refreshPageROIProjections(); 
                break;
        }
    }
}

function refreshPageAwards() {
    const grid = document.getElementById('pageAwardsGrid');
    if (!grid) return;
    
    const nomineesMVP = getMonthlyAwardNominees('MVP', new Date().getMonth(), new Date().getFullYear());
    const nomineesRookie = getMonthlyAwardNominees('ROOKIE', new Date().getMonth(), new Date().getFullYear());
    const nomineesSpeedster = getMonthlyAwardNominees('SPEEDSTER', new Date().getMonth(), new Date().getFullYear());
    const nomineesIronWill = getMonthlyAwardNominees('IRON_WILL', new Date().getMonth(), new Date().getFullYear());
    const nomineesQuality = getMonthlyAwardNominees('QUALITY_QUEEN', new Date().getMonth(), new Date().getFullYear());
    
    grid.innerHTML = `
        <div class="award-card">
            <div class="award-icon" style="background: #fbbf24;"><i class="fas fa-trophy"></i></div>
            <div class="award-details">
                <h4>Most Valuable Player</h4>
                <p>Best overall performance</p>
                <div class="nominee-list">
                    ${nomineesMVP.map((n, i) => `<span class="nominee ${i === 0 ? 'winner' : ''}">${n.name}</span>`).join('')}
                </div>
            </div>
        </div>
        
        <div class="award-card">
            <div class="award-icon" style="background: #10b981;"><i class="fas fa-star"></i></div>
            <div class="award-details">
                <h4>Rookie of the Month</h4>
                <p>Best new starter</p>
                <div class="nominee-list">
                    ${nomineesRookie.map((n, i) => `<span class="nominee ${i === 0 ? 'winner' : ''}">${n.name}</span>`).join('')}
                </div>
            </div>
        </div>
        
        <div class="award-card">
            <div class="award-icon" style="background: #f59e0b;"><i class="fas fa-bolt"></i></div>
            <div class="award-details">
                <h4>Speedster of the Month</h4>
                <p>Fastest average picking time</p>
                <div class="nominee-list">
                    ${nomineesSpeedster.map((n, i) => `<span class="nominee ${i === 0 ? 'winner' : ''}">${n.name} (${n.value} min)</span>`).join('')}
                </div>
            </div>
        </div>
        
        <div class="award-card">
            <div class="award-icon" style="background: #6b7280;"><i class="fas fa-shield"></i></div>
            <div class="award-details">
                <h4>Iron Will Award</h4>
                <p>Perfect attendance</p>
                <div class="nominee-list">
                    ${nomineesIronWill.map((n, i) => `<span class="nominee ${i === 0 ? 'winner' : ''}">${n.name} (${n.value} days)</span>`).join('')}
                </div>
            </div>
        </div>
        
        <div class="award-card">
            <div class="award-icon" style="background: #8b5cf6;"><i class="fas fa-crown"></i></div>
            <div class="award-details">
                <h4>Quality King/Queen</h4>
                <p>Highest quality score</p>
                <div class="nominee-list">
                    ${nomineesQuality.map((n, i) => `<span class="nominee ${i === 0 ? 'winner' : ''}">${n.name} (${n.value}%)</span>`).join('')}
                </div>
            </div>
        </div>
    `;
}

function refreshPageMyStats() {
    const staffId = 1; // Replace with current user ID
    const staff = staffMembers.find(s => s.id === staffId);
    const gam = staffGamification[staffId] || {};
    
    if (staff) {
        document.getElementById('pageMyStatsAvatar').textContent = staff.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        document.getElementById('pageMyStatsName').textContent = staff.name;
        document.getElementById('pageMyStatsRole').textContent = staff.role;
    }
    
    document.getElementById('pageMyStatsOrders').textContent = gam.totalOrders || 0;
    document.getElementById('pageMyStatsPlants').textContent = gam.totalPlants || 0;
    document.getElementById('pageMyStatsFastPicks').textContent = gam.fastPicks || 0;
    document.getElementById('pageMyStatsStreak').textContent = `${gam.currentStreak || 0} days`;
    document.getElementById('pageMyStatsAchievements').textContent = (gam.achievements || []).length;
    
    const leaderboard = calculateLeaderboard('orders', 'all', 'all');
    const rank = leaderboard.findIndex(e => e.staffId === staffId) + 1;
    document.getElementById('pageMyStatsRank').textContent = `#${rank || 'N/A'}`;
    
    const myAchievements = (gam.achievements || []).slice(0, 6);
    const grid = document.getElementById('pageMyAchievementsGrid');
    
    if (myAchievements.length > 0) {
        grid.innerHTML = myAchievements.map(achievement => `
            <div class="achievement-card earned" style="padding: 10px;">
                <div class="achievement-icon" style="width: 30px; height: 30px; font-size: 14px; background: ${achievement.color}">
                    <i class="fas ${achievement.icon}"></i>
                </div>
                <div class="achievement-info">
                    <div class="achievement-name" style="font-size: 12px;">${achievement.name}</div>
                    <div class="achievement-date" style="font-size: 9px;">${new Date(achievement.earnedDate).toLocaleDateString()}</div>
                </div>
            </div>
        `).join('');
    } else {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No achievements yet</p>';
    }
}

