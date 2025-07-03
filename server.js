// Simple Node.js server to display BPM chart
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());

////
// TEMPLATE FUNCTIONS
////

// Load and handle html templates
function loadTemplate(templateName, variables = {}) {
  try {
    // Fetch template
    const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
    let template = fs.readFileSync(templatePath, 'utf-8');
    
    // Replace var in templates
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, variables[key]);
    });
    
    return template;
  } catch (err) {
    console.error(`Error loading template ${templateName}:`, err);
    return '<h1>Template Error</h1>';
  }
}


////
// LOADING FUNCTIONS
////

// Load data from vib-eMotion BPM recording
function loadBpmDataFromFiles() {
  var maxID = 0;
  const bpmData = {};
  const filePath = path.join(__dirname, 'data', 'bpm_data.txt');

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    
    for (const line of lines) {
      // Match pattern like: "77, /98/ 66 1749735435400.;"
      const match = line.match(/^(\d+),\s*\/(\d+)\/\s+(\d+)\s+(\d+)\.;/);
      
      if (match) {
        const [, , id, bpm, timestamp] = match;
        
        if (bpmData[id]) {
          // If id already exists add data to the array
          bpmData[id].data.push(parseInt(bpm));
          bpmData[id].time.push(parseInt(timestamp)); // Unix timestamp format
        } else {
          // To find max id
          if (maxID < parseInt(id)) {
            maxID = id;
          }
          
          // Else create new array
          bpmData[id] = {
            name: `Siège ${id}`,
            data: [parseInt(bpm)],
            time: [parseInt(timestamp)] // Unix timestamp format
          }
        }
      }
    }
  } catch (err) {
    console.error('Error reading or parsing the file:', err);
  }
    
  if (maxID == 0) {
    console.error('Error no data in file');
  }

  // Compute average BPM every second (1000 ms)
  const averageBpm = calculateAverageBpm(bpmData, 5000);
    
  return [maxID, averageBpm.users, averageBpm.global];
}

// Compute average BPM for a given interval and apply the same temporal smoothing per user
function calculateAverageBpm(bpmData, intervalMs = 1000) {
  const userIds = Object.keys(bpmData);

  if (userIds.length === 0) {
    return { global: { name: 'Moyenne globale', data: [], time: [] }, users: {} };
  }

  // Find time bounds
  let minTimestamp = Infinity;
  let maxTimestamp = -Infinity;

  userIds.forEach(id => {
    const times = bpmData[id].time;
    if (times.length > 0) {
      minTimestamp = Math.min(minTimestamp, Math.min(...times));
      maxTimestamp = Math.max(maxTimestamp, Math.max(...times));
    }
  });

  // Invalid data
  if (minTimestamp === Infinity) {
    return { global: { name: 'Moyenne globale', data: [], time: [] }, users: {} };
  }

  const averageData = [];
  const averageTime = [];
  const userSmoothedData = {};

  userIds.forEach(id => {
    userSmoothedData[id] = {
      name: id,
      data: [],
      time: []
    };
  });

  // Loop over all time intervals
  for (let currentTime = minTimestamp; currentTime <= maxTimestamp; currentTime += intervalMs) {
    const intervalEnd = currentTime + intervalMs;
    const userAverages = []; // All users' avg for this interval

    userIds.forEach(id => {
      const userData = bpmData[id];
      const bpmValuesInInterval = []; // All bpm values for user in this interval

      // Loop through all values, not optimal
      for (let i = 0; i < userData.time.length; i++) {
        const timestamp = userData.time[i];
        if (timestamp >= currentTime && timestamp < intervalEnd) {
          bpmValuesInInterval.push(userData.data[i]);
        }
      }

      // Compute user avg in this interval
      if (bpmValuesInInterval.length > 0) {
        const userAverage = bpmValuesInInterval.reduce((sum, bpm) => sum + bpm, 0) / bpmValuesInInterval.length;
        const roundedAvg = Math.round(userAverage * 100) / 100;

        // Add user's value for this interval
        userAverages.push(roundedAvg);

        // Add smoothed value for this user
        userSmoothedData[id].data.push(roundedAvg);
        userSmoothedData[id].time.push(currentTime);
      } else {
        // Add null data to keep time alignment
        userSmoothedData[id].data.push(null);
        userSmoothedData[id].time.push(currentTime);
      }
    });

    // Compute all users avg for this interval
    if (userAverages.length > 0) {
      const globalAverage = userAverages.reduce((sum, avg) => sum + avg, 0) / userAverages.length;
      averageData.push(Math.round(globalAverage * 100) / 100);
      averageTime.push(currentTime);
    }
  }

  return {
    global: {
      name: 'Moyenne globale',
      data: averageData,
      time: averageTime
    },
    users: userSmoothedData
  };
}


////
// BPM DATA LOADING AT STARTUP
////

const data = loadBpmDataFromFiles();
const NUM_SEATS = data[0];
const bpmData = data[1];
const avgBpm = data[2];


////
// ROUTES 
////

// Get bpm data
app.get('/api/bpm/:userId', (req, res) => {
  const { userId } = req.params;
  
  if (bpmData[userId]) {
    res.json({
      success: true,
      userId: userId,
      profile: bpmData[userId].name,
      bpmData: bpmData[userId].data,
      time: bpmData[userId].time,
      avg: avgBpm.data,
      avgTime: avgBpm.time
    });
  } else {
    res.status(404).json({ success: false, message: 'Data not found' });
  }
});

// Authentication route
app.get('/api/auth/:userId', (req, res) => {
  const { userId } = req.params;
  
  if (bpmData[userId]) {
    res.json({
      success: true,
      userId: userId,
      profile: bpmData[userId].name
    });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

// Authentification route for auth with link 
app.get('/auth/:userId', (req, res) => {
  let { userId } = req.params;

  if (!bpmData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: req.params.userId,
      numSeats: NUM_SEATS
    });
    res.status(404).send(errorHtml);
    return;
  }

  const validUsersArray = Object.keys(bpmData);
  const validUsersString = validUsersArray.map(u => `'${u}'`).join(', ');

  const dashboardHtml = loadTemplate('dashboard', {
    numSeats: NUM_SEATS,
    validUsersString: validUsersString,
    userId: userId,
    autoAuth: 'true',
    authSectionDisplay: 'none',
    mainSectionDisplay: 'none'
  });

  res.send(dashboardHtml);
});

// Main route
app.get('/', (req, res) => {
  const validUsersArray = Object.keys(bpmData);
  const validUsersString = validUsersArray.map(u => `'${u}'`).join(', ');
    
  const dashboardHtml = loadTemplate('dashboard', {
    numSeats: NUM_SEATS,
    validUsersString: validUsersString,
    userId: '',
    autoAuth: 'false',
    authSectionDisplay: 'block',
    mainSectionDisplay: 'none'
  });

  res.send(dashboardHtml);
});

// Server startup
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur BPM démarré sur http://0.0.0.0:${PORT}`);
  console.log(`📱 Accès local: http://localhost:${PORT}`);
  console.log(`🌐 Accès réseau: http://[IP-DU-MAC]:${PORT}`);
  console.log(`📊 Configuration: ${NUM_SEATS} sièges (identifiants 1 à ${NUM_SEATS})`);
});