// Simple Node.js server to display BPM chart
const { timeStamp } = require('console');
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.static('.'));
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
  var baselineStop = 0;
  const bpmData = {};
  const filePath = path.join(__dirname, 'data', 'bpm_data.txt');

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    
    for (const line of lines) {
      // Match pattern like: "77, /98/ 66 1749735435400.;"
      const match = line.match(/^(\d+),\s*\/(\d+)\/\s+(\d+)\s+(\d+)\.;/);
      const baseline = line.match(/^(\d+),\s*Stop\s+(\d+)\.\;$/);
      
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
      } else if (baseline) {
        const [, , timestamp] = baseline;
        // Search baseline info 
        baselineStop = parseInt(timestamp);
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
    
  return [maxID, averageBpm.users, averageBpm.global, baselineStop];
}

// Compute average BPM for a given interval and apply the same temporal smoothing per user
function calculateAverageBpm(bpmData, intervalMs = 1000) {
  const userIds = Object.keys(bpmData);

  if (userIds.length === 0) {
    return { global: { name: 'Moyenne globale', data: [], time: [], std: [] }, users: {} };
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
    return { global: { name: 'Moyenne globale', data: [], time: [], std: [] }, users: {} };
  }

  const averageData = [];
  const averageTime = [];
  const stdData = [];
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
    const userAverages = [];

    userIds.forEach(id => {
      const userData = bpmData[id];
      const bpmValuesInInterval = [];

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

      // Compute std deviation across users for this interval
      const variance = userAverages.reduce((sum, avg) => sum + Math.pow(avg - globalAverage, 2), 0) / userAverages.length;
      let std = Math.round(Math.sqrt(variance) * 100) / 100
      stdData.push(std);
    }
  }

  // console.log(stdData);

  return {
    global: {
      name: 'Moyenne globale',
      data: averageData,
      time: averageTime,
      std: stdData
    },
    users: userSmoothedData
  };
}

function loadLandmarks(t0) {
  const landmarks = [];
  const filePath = path.join(__dirname, 'data', 'landmarks.txt');

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    
    for (const line of lines) {
      // Match pattern like: "30, jumpscare, red;"
      const match = line.match(/^(\d+),\s*([^,]+),\s*(#[0-9A-Fa-f]{6});$/);
      
      if (match) {
        const [, time, label, color] = match;

        landmarks.push({
          timestamp: parseInt(time)*60000 + t0 + 30000, 
          label: label, 
          color: color
        });
      }
    }
  } catch (err) {
    console.error('Error reading or parsing the file:', err);
  }
  
  return landmarks;
}

// Load Synchronie data
function loadSynchronie(tb) {
  const synchronieData = [];
  const synchronieTime = [];
  const filePath = path.join(__dirname, 'data', 'synchronie.txt');

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    
    for (const line of lines) {
      // Match pattern like : "[1767782674701] /Synchronie/ (8950.0751953125,)"
      const match = line.match(/^\[(\d+)\]\s*\/Synchronie\/\s*\(([^)]+)\)$/);

      if (match) {
        const [, timestamp, sync] = match;

        synchronieData.push(parseInt(sync));
        synchronieTime.push(parseInt(timestamp));
      }
    }
  } catch (err) {
    console.error('Error reading or parsing the file:', err);
  }

  for (let i = 0; i< synchronieTime.length; i++) {
    synchronieTime[i] = synchronieTime[i] - synchronieTime[0] + tb;
  }

  const smoothedData = calculateSmoothedSync(synchronieData, synchronieTime, 5000);
  // console.log(smoothedData.sync);

  return [smoothedData.sync, smoothedData.time];
}


// Compute smoothed synchronie for a given interval
function calculateSmoothedSync(synchronieData, synchronieTime, intervalMs = 1000) {
  
  // Find time bounds
  let minTimestamp = Math.min(...synchronieTime);
  let maxTimestamp = Math.max(...synchronieTime);

  const smoothedSyncData = [];
  const smoothedSyncTime = [];

  // Loop over all time intervals
  let lastIndex = 0;
  for (let currentTime = minTimestamp; currentTime <= maxTimestamp; currentTime += intervalMs) {
    const intervalEnd = currentTime + intervalMs;
    const synValuesInInterval = []; // All sync values in this interval

    //for (let i = 0; i < synchronieTime.length; i++) {
    while (lastIndex < synchronieTime.length && synchronieTime[lastIndex] < intervalEnd) {
        const timestamp = synchronieTime[lastIndex];
        lastIndex += 1;
        if (timestamp >= currentTime && timestamp < intervalEnd) {
          synValuesInInterval.push(synchronieData[lastIndex] / 100);
        }
    }

    // Compute avg in this interval
    if (synValuesInInterval.length > 0) {
      const avg = synValuesInInterval.reduce((sum, sync) => sum + sync, 0) / synValuesInInterval.length;
      const roundedAvg = Math.round(avg * 100) / 100;
      
      // Only add data AND time when we have actual values
      smoothedSyncData.push(roundedAvg);
      smoothedSyncTime.push(currentTime);
    }
    // No else clause - skip null intervals entirely
  }

  return { 
    sync : smoothedSyncData, 
    time : smoothedSyncTime 
  };
}


////
// BPM DATA LOADING AT STARTUP
////

const data = loadBpmDataFromFiles();
const NUM_SEATS = data[0];
const bpmData = data[1];
const avgBpm = data[2];
const tbaseline = data[3];
const landmarks = loadLandmarks(avgBpm.time[0]);
const synchronie = loadSynchronie(tbaseline);


////
// ROUTES 
////

// Handle CSS file requests
app.get('/shared-styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'shared-styles.css'));
});

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
      avgTime: avgBpm.time,
      std: avgBpm.std,
      landmarks: landmarks,
      synchronieData: synchronie[0],
      synchronieTime: synchronie[1] 
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
// Main route goes to authentication page
app.get('/', (req, res) => {
  const authHtml = loadTemplate('authentication', {
    numSeats: NUM_SEATS
  });

  res.send(authHtml);
});

// Server startup
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur BPM démarré sur http://0.0.0.0:${PORT}`);
  console.log(`📱 Accès local: http://localhost:${PORT}`);
  console.log(`🌐 Accès réseau: http://[IP-DU-MAC]:${PORT}`);
  console.log(`📊 Configuration: ${NUM_SEATS} sièges (identifiants 1 à ${NUM_SEATS})`);
});