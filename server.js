// Simple Node.js server to display BPM chart
const express = require('express');
const fs = require('fs');
const path = require('path');
const osc = require('osc');
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
          timestamp: parseInt(time)*60000 + t0, 
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


////
// BPM DATA LOADING AT STARTUP
////

const data = loadBpmDataFromFiles();
const NUM_SEATS = data[0];
const bpmData = data[1];
const avgBpm = data[2];
const landmarks = loadLandmarks(avgBpm.time[0]);


////
// OSC
////

const Status = Object.freeze({
  PENDING: "PENDING",
  RECORDING: "RECORDING",
  SAVED: "SAVED"
});

var userData = {};

userData[1] = {
    baseline: {      
      status: Status.SAVED,
      data: {
        bpm: [],
        timestamp: []
      }
    },
    room1: {
      status: Status.SAVED,
      data: {
        bpm: [],
        timestamp: []
      }
    },
    room2: {
      status: Status.RECORDING,
      data: {
        bpm: [],
        timestamp: []
      }
    },
    room3: {
      status: Status.PENDING,
      data: {
        bpm: [],
        timestamp: []
      }
    },
    room4: {
      status: Status.PENDING,
      data: {
        bpm: [],
        timestamp: []
      }
    }
}


// Create an OSC UDP Port on localhost, port 8000
const udpPort = new osc.UDPPort({
  localAddress: "127.0.0.1", // should be an arg given at app startup
  localPort: 8000,
  metadata: true
});

// Listen for OSC messages and store data
udpPort.on("message", (oscMsg, timeTag, info) => {

  const match = oscMsg.address.match(/^\/oh1\/(\d+)\/bpm$/);
  if (match) {
    const id = parseInt(match[1], 10);

    // Check if it is currently in use
    if (userData[id]) {

      // Check at what stage it is
      // TODO: find a better way to do it
      var idStatus = -1;
      if (userData[id].baseline.status == Status.RECORDING) idStatus = 0;
      else if (userData[id].room1.status == Status.RECORDING) idStatus = 1;
      else if (userData[id].room2.status == Status.RECORDING) idStatus = 2;
      else if (userData[id].room3.status == Status.RECORDING) idStatus = 3;
      else if (userData[id].room4.status == Status.RECORDING) idStatus = 4;

      const bpm = oscMsg.args[0].value;
      const timestamp = Date.now(); // timestamp in ms

      // Build folder path
      const userFolder = path.join(__dirname, "user", String(id));
      // Ensure folder exists
      if (!fs.existsSync(userFolder)) {
        fs.mkdirSync(userFolder, { recursive: true });
      }
      
      // Filepath depends on stage
      let filePath;
      if (idStatus === 0) {
        filePath = path.join(userFolder, "baseline.txt");
      } else if (idStatus > 0 && idStatus < 5) {
        filePath = path.join(userFolder, `stage_${idStatus}.txt`);
      }

      if (filePath) {
        const line = `${bpm}, ${timestamp};\n`;

        // Append or create file
        fs.appendFile(filePath, line, (err) => {
          if (err) {
            console.error("Error writing to file:", err);
          }
        });

      }

    }
    
  }

});

// Open the connection
udpPort.open();


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
      avgTime: avgBpm.time,
      landmarks: landmarks
    });
  } else {
    res.status(404).json({ success: false, message: 'Data not found' });
  }
});

// Room selection route after authentication
app.get('/room-selection/:userId', (req, res) => {
  const { userId } = req.params;
  
  // Validate user exists
  if (!userData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: userId,
      numSeats: NUM_SEATS
    });
    res.status(404).send(errorHtml);
    return;
  }

  const roomSelectionHtml = loadTemplate('room-selection', {
    userId: userId
  });

  res.send(roomSelectionHtml);
});

// Get the right graph for the room and user
app.get('/room/:roomId/:userId', (req, res) => {
  const { roomId, userId } = req.params;

  // If user doesn't exist throw error
  if (!userData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: req.params.userId,
      numSeats: NUM_SEATS
    });

    res.status(404).send(errorHtml);
    return;
  }

  // If user exist check room status
  // Retrieve room status depending on id (should find a better way to do it)
  var roomStatus = Status.PENDING;
  if (roomId == 1) roomStatus = userData[userId].room1.status;
  if (roomId == 2) roomStatus = userData[userId].room2.status;
  if (roomId == 3) roomStatus = userData[userId].room3.status;
  if (roomId == 4) roomStatus = userData[userId].room4.status;

  if (roomStatus== Status.PENDING) {
    const recordHtml = loadTemplate('record', {
      userId: userId,
      roomId: roomId
    });

    res.send(recordHtml);
  } else if (roomStatus == Status.RECORDING) {
    // TODO: show the time we stopped at
    const recordHtml = loadTemplate('record', {
      userId: userId,
      roomId: roomId
    });

    res.send(recordHtml);
  } else if (roomStatus == Status.SAVED) {
    const dashboardHtml = loadTemplate('dashboard', {
      userId: userId,
      roomId: roomId,
      autoAuth: 'true'
    });

    res.send(dashboardHtml);
  }
});

// Authentication route
app.get('/auth/:userId', (req, res) => {
  let { userId } = req.params;

  // User doesn't exist throw error
  if (!userData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: req.params.userId,
      numSeats: NUM_SEATS
    });
    res.status(404).send(errorHtml);
    return;
  }

  // Else redirect toward room selection
  const roomSelectionHtml = loadTemplate('room-selection', {
    userId: userId
  });
  
  res.send(roomSelectionHtml);
});

// Error authenticating
app.get('/error/:userId', (req, res) => {
  let userId = req.params.userId;

  const errorHtml = loadTemplate('error', {
    userId: userId,
    numSeats: NUM_SEATS
  });

  res.status(404).send(errorHtml);
});

// Main route goes to authentication page
app.get('/', (req, res) => {
  const validUsersArray = Object.keys(bpmData);
  const validUsersString = validUsersArray.map(u => `'${u}'`).join(', ');
    
  const authHtml = loadTemplate('authentication', {
    numSeats: NUM_SEATS,
    validUsersString: validUsersString
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