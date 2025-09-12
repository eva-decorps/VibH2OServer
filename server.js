// Simple Node.js server to display BPM chart
const express = require('express');
const fs = require('fs');
const path = require('path');
const osc = require('osc');
const app = express();
const PORT = 3000;

////
// PARSE ARGUMENTS
////

// Parse command line arguments
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  let numSeats = 10; // Default value
  let oscPort = 8000; // Default OSC port
  let serverPort = 3000; // Default server port

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--seats':
      case '-s':
        if (i + 1 < args.length) {
          const seats = parseInt(args[i + 1]);
          if (seats > 0) {
            numSeats = seats;
            i++; // Skip next argument as it's the value
          } else {
            console.error('❌ Error: Number of seats must be a positive integer');
            process.exit(1);
          }
        }
        break;
      case '--osc-port':
      case '-o':
        if (i + 1 < args.length) {
          const port = parseInt(args[i + 1]);
          if (port > 0 && port <= 65535) {
            oscPort = port;
            i++; // Skip next argument as it's the value
          } else {
            console.error('❌ Error: OSC port must be between 1 and 65535');
            process.exit(1);
          }
        }
        break;
      case '--server-port':
      case '-p':
        if (i + 1 < args.length) {
          const port = parseInt(args[i + 1]);
          if (port > 0 && port <= 65535) {
            serverPort = port;
            i++; // Skip next argument as it's the value
          } else {
            console.error('❌ Error: Server port must be between 1 and 65535');
            process.exit(1);
          }
        }
        break;
      case '--help':
      case '-h':
        console.log(`
🎵 BPM Recording Server

Usage: node server.js [options]

Options:
  --seats, -s <number>      Number of seats/users (default: 10)
  --osc-port, -o <number>   OSC listening port (default: 8000)
  --server-port, -p <number> HTTP server port (default: 3000)
  --help, -h               Show this help message

Examples:
  node server.js --seats 20
  node server.js -s 5 -o 8001 -p 3001
  node server.js --seats 15 --osc-port 8002
        `);
        process.exit(0);
        break;
      default:
        console.error(`❌ Unknown argument: ${args[i]}`);
        console.log('Use --help or -h for usage information');
        process.exit(1);
    }
  }

  return { numSeats, oscPort, serverPort };
}

// Get configuration from command line
const config = parseCommandLineArgs();
const NUM_SEATS = config.numSeats;
const OSC_PORT = config.oscPort;
const SERVER_PORT = config.serverPort;

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
// USER DATA INITIALIZATION
////

// Initialize user data for all seats
function initializeUserData() {
  const userData = {};
  
  for (let userId = 1; userId <= NUM_SEATS; userId++) {
    userData[userId] = {
      baseline: {      
        status: Status.SAVED,
        startTime: null,
        data: {
          bpm: [],
          timestamp: []
        }
      },
      room1: {
        status: Status.PENDING,
        startTime: null,
        data: {
          bpm: [],
          timestamp: []
        }
      },
      room2: {
        status: Status.PENDING,
        startTime: null,
        data: {
          bpm: [],
          timestamp: []
        }
      },
      room3: {
        status: Status.PENDING,
        startTime: null,
        data: {
          bpm: [],
          timestamp: []
        }
      },
      room4: {
        status: Status.PENDING,
        startTime: null,
        data: {
          bpm: [],
          timestamp: []
        }
      }
    };
  }
  
  return userData;
}

////
// LOADING FUNCTIONS
////

// ICI il fait refaire toute la logique 
// load les data de user 
// id max doit pas être en fonction des données existantes et tous les user doivent être initialisés

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

function deleteUserFile(id, idStatus) {
  const userFolder = path.join(__dirname, "user", String(id));

  let filePath;
  if (idStatus === 0) {
    filePath = path.join(userFolder, "baseline.txt");
  } else if (idStatus > 0 && idStatus < 5) {
    filePath = path.join(userFolder, `stage_${idStatus}.txt`);
  }

  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath); // deletes the file
  } else {
    console.log("File not found:", filePath);
  }
}

////
// STATUS ENUM
////

const Status = Object.freeze({
  PENDING: "PENDING",
  RECORDING: "RECORDING",
  SAVED: "SAVED"
});

////
// BPM DATA LOADING AT STARTUP
////

//const data = loadBpmDataFromFiles();
//const bpmData = data[1];
//const landmarks = loadLandmarks(bpmData.time[0]);

// Initialize user data for all configured seats
var userData = initializeUserData();

////
// OSC
////

// Create an OSC UDP Port on localhost, configured port
const udpPort = new osc.UDPPort({
  localAddress: "127.0.0.1", // should be an arg given at app startup
  localPort: OSC_PORT,
  metadata: true
});

// Listen for OSC messages and store data
udpPort.on("message", (oscMsg, timeTag, info) => {

  const match = oscMsg.address.match(/^\/oh1\/(\d+)\/bpm$/);
  if (match) {
    const id = parseInt(match[1], 10);

    // Check if user ID is within configured range
    if (id < 1 || id > NUM_SEATS) {
      //console.warn(`⚠️  Received OSC message for user ${id}, but only seats 1-${NUM_SEATS} are configured`);
      return;
    }

    // Check if it is currently in use
    if (userData[id]) {

      // Check at what stage it is
      const bpm = parseInt(oscMsg.args[0].value);
      const timestamp = parseInt(Date.now()); // timestamp in ms
      
      var idStatus = -1;
      var roomKey = 'baseline';
      for (let roomId=0; roomId<=4; roomId++) {
        if (roomId>0) roomKey = `room${roomId}`;
        if (userData[id][roomKey].status == Status.RECORDING) {
          idStatus = roomId;
          userData[id][roomKey].data.bpm.push(bpm);
          userData[id][roomKey].data.timestamp.push(timestamp);
        }
      }

      // Also store it in case of a server crash
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

// Handle CSS file requests
app.get('/shared-styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'shared-styles.css'));
});

// Get bpm data
app.get('/api/bpm/:userId/:roomId', (req, res) => {
  const { userId, roomId } = req.params;
  const roomKey = `room${roomId}`;

  // Check data exists
  
  if (bpmData[userId]) {
    res.json({
      success: true,
      userId: userId,
      profile: `User ${userId}`,
      bpmData: userData[userId][roomKey].data.bpm,
      time: userData[userId][roomKey].data.timestamp
    });
  } else {
    res.status(404).json({ success: false, message: 'Data not found' });
  }
});

// User registration after authentication
app.get('/user-registration/:userId', (req, res) => {
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

  const userRegistrationHtml = loadTemplate('user-registration', {
    userId: userId
  });

  res.send(userRegistrationHtml);
});

// Room selection route after registration
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

  // If user exist check room status and start time
  const roomKey = `room${roomId}`;
  const roomStatus = userData[userId][roomKey].status;
  const startTime = userData[userId][roomKey].startTime;

  if (roomStatus== Status.PENDING) {
    const recordHtml = loadTemplate('record', {
      userId: userId,
      roomId: roomId,
      isRecording: false,
      startTime: startTime
    });

    res.send(recordHtml);
  } else if (roomStatus == Status.RECORDING) {
    const recordHtml = loadTemplate('record', {
      userId: userId,
      roomId: roomId,
      isRecording: true,
      startTime: startTime
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
  
  // Else redirect toward user registration
  const userRegistrationHtml = loadTemplate('user-registration', {
    userId: userId
  });
  
  res.send(userRegistrationHtml);
});

// Error authenticating
app.get('/error/:userId', (req, res) => {
  let { userId } = req.params;

  const errorHtml = loadTemplate('error', {
    userId: userId,
    numSeats: NUM_SEATS
  });

  res.status(404).send(errorHtml);
});

// Main route goes to authentication page
app.get('/', (req, res) => {
  const authHtml = loadTemplate('authentication', {
    numSeats: NUM_SEATS
  });

  res.send(authHtml);
});

// Start recording for specified room
app.post('/api/record/start/:userId/:roomId', (req, res) => {
  const { userId, roomId } = req.params;
  
  // Validate user exists
  if (!userData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: userId,
      numSeats: NUM_SEATS
    });

    res.status(404).send(errorHtml);
  }

  // Validate room ID (1-4)
  if (roomId < 1 || roomId > 4) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid room ID' 
    });
  }

  // Get the room key based on roomId
  const roomKey = `room${roomId}`;

  // Check if room exists in userData
  if (!userData[userId][roomKey]) {
    return res.status(400).json({ 
      success: false, 
      message: 'Room not found for user' 
    });
  }

  // Set status to RECORDING
  userData[userId][roomKey].status = Status.RECORDING;
  userData[userId][roomKey].startTime = Date.now();
  // If another room was recording set it to SAVED
  for (let i=1; i<=4; i++) {
    if (i!=roomId) {
      const key = `room${i}`;
      if (userData[userId][key].status == Status.RECORDING) {
        userData[userId][key].status = Status.SAVED;
        userData[userId][key].startTime = null;
      }
    }
  }

  res.json({ 
    success: true, 
    message: 'Recording started',
    status: Status.RECORDING
  });
});

// Stop recording for specified room
app.post('/api/record/stop/:userId/:roomId', (req, res) => {
  const { userId, roomId } = req.params;
  
  // Validate user exists
  if (!userData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: userId,
      numSeats: NUM_SEATS
    });

    res.status(404).send(errorHtml);
  }

  // Validate room ID (1-4)
  if (roomId < 1 || roomId > 4) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid room ID' 
    });
  }

  // Get the room key based on roomId
  const roomKey = `room${roomId}`;

  // Check if room exists in userData
  if (!userData[userId][roomKey]) {
    return res.status(400).json({ 
      success: false, 
      message: 'Room not found for user' 
    });
  }

  // Set status to SAVED
  userData[userId][roomKey].status = Status.SAVED;
  userData[userId][roomKey].startTime = null;

  res.json({ 
    success: true, 
    message: 'Recording stopped',
    status: Status.RECORDING
  });
});

// Cancel recording for specified room
app.post('/api/record/cancel/:userId/:roomId', (req, res) => {
  const { userId, roomId } = req.params;
  
  // Validate user exists
  if (!userData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: userId,
      numSeats: NUM_SEATS
    });

    res.status(404).send(errorHtml);
  }

  // Validate room ID (1-4)
  if (roomId < 1 || roomId > 4) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid room ID' 
    });
  }

  // Get the room key based on roomId
  const roomKey = `room${roomId}`;

  // Check if room exists in userData
  if (!userData[userId][roomKey]) {
    return res.status(400).json({ 
      success: false, 
      message: 'Room not found for user' 
    });
  }

  // Set status to PENDING
  userData[userId][roomKey].status = Status.PENDING;
  userData[userId][roomKey].startTime = null;
  // Reset data in dict
  userData[userId][roomKey].data.bpm = [];
  userData[userId][roomKey].data.timestamp = [];
  // Delete files
  deleteUserFile(userId, roomId);

  res.json({ 
    success: true, 
    message: 'Recording cancelled',
    status: Status.PENDING
  });
});

// Reset user data for new registration
app.post('/api/registration/new/:userId', (req, res) => {
  const { userId } = req.params;
  
  // Validate user exists
  if (!userData[userId]) {
    const errorHtml = loadTemplate('error', {
      userId: userId,
      numSeats: NUM_SEATS
    });

    res.status(404).send(errorHtml);
  }

  for (let roomId = 1; roomId <= 4; roomId++) {
    // Get the room key based on roomId
    const roomKey = `room${roomId}`;

    // Set status to PENDING
    userData[userId][roomKey].status = Status.PENDING;
    userData[userId][roomKey].startTime = null;
    // Reset data in dict
    userData[userId][roomKey].data.bpm = [];
    userData[userId][roomKey].data.timestamp = [];
    // Delete files
    deleteUserFile(userId, roomId);
  }

  res.json({ 
    success: true, 
    message: 'Data successfully reset',
    status: Status.PENDING
  });
});

// Server startup
app.listen(SERVER_PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur BPM démarré sur http://0.0.0.0:${SERVER_PORT}`);
  console.log(`📱 Accès local: http://localhost:${SERVER_PORT}`);
  console.log(`🌐 Accès réseau: http://[IP-DU-MAC]:${SERVER_PORT}`);
  console.log(`📊 Configuration: ${NUM_SEATS} sièges (identifiants 1 à ${NUM_SEATS})`);
  console.log(`🎵 OSC listening on port: ${OSC_PORT}`);
  console.log('');
  console.log('💡 Use --help or -h for command line options');
});