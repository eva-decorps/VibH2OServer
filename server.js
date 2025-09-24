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
        status: Status.PENDING,
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

// Load data if was already recorder
function loadBpmDataFromFiles(userData) {

  // Loop through all sensors
  for (let i=1; i<=NUM_SEATS; i++) {
    // Loop through all rooms
    for (let room=0; room<=2; room++) {
      const roomKey = room >0 ? `room${room}` : 'baseline';
      var filePath = path.join(__dirname, 'user', `${i}`, `stage_${room}.txt`);

      if (!fs.existsSync(filePath)) {
        // Skip if file does not exist
        continue;
      }

      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split('\n');
    
        for (const line of lines) {
          var match = line.match(/(\d+),\s*(\d+);/);
          if (match) {
            const [bpm, timestamp] = match;
            userData[i][roomKey].data.bpm.push(parseInt(bpm));
            userData[i][roomKey].data.timestamp.push(parseInt(timestamp));
            userData[i][roomKey].status = Status.RECORDING;
          }

          match = line.match("stop;");
          if (match) {
            userData[i][roomKey].status = Status.SAVED;
            userData[i][roomKey].startTime = null;
          }

        }
        
        if (userData[i][roomKey].status == Status.RECORDING) {
          userData[i][roomKey].startTime = userData[i][roomKey].data.timestamp[0];
        }

      } catch (err) {
        console.error('Error reading or parsing the file:', err);
      }
    } 
  }
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
  }
}

function stopRecordingInFile(id, idStatus) {
  const userFolder = path.join(__dirname, "user", String(id));

  let filePath;
  if (idStatus === 0) {
    filePath = path.join(userFolder, "baseline.txt");
  } else if (idStatus > 0 && idStatus < 5) {
    filePath = path.join(userFolder, `stage_${idStatus}.txt`);
  }

  if (filePath && fs.existsSync(filePath)) {
    // Write stop at the end of file
    fs.appendFile(filePath, `stop;\n`, (err) => {
      if (err) {
        console.error("Error writing to file:", err);
      }
    });
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

// Initialize user data for all configured seats
var userData = initializeUserData();
loadBpmDataFromFiles(userData);

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
      return;
    }

    // Check if it is currently in use
    if (userData[id]) {

      // Check at what stage it is
      const bpm = parseInt(oscMsg.args[0].value);
      const timestamp = parseInt(Date.now()); // timestamp in ms
      
      var idStatus = -1;
      var roomKey = 'baseline';
      for (let roomId=0; roomId<=4; roomId++) 
      {
        if (roomId>0) roomKey = `room${roomId}`;

        if (userData[id][roomKey].status == Status.RECORDING) 
        {
          let line = `${bpm}, ${timestamp};\n`;

          idStatus = roomId;
          userData[id][roomKey].data.bpm.push(bpm);
          userData[id][roomKey].data.timestamp.push(timestamp);

          // Auto stop after 10'10" if wasn't stopped before
          const elapsedTime = (timestamp - userData[id][roomKey].data.timestamp[0]) / 1000;
          if (elapsedTime > 610) {
            // Set status to SAVED
            userData[id][roomKey].status = Status.SAVED;
            userData[id][roomKey].startTime = null;
            // Write stop in file
            line = `stop;\n`;
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
            // Append or create file
            fs.appendFile(filePath, line, (err) => {
              if (err) {
                console.error("Error writing to file:", err);
              }
            });

          }

        }
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
  
  if (userData[userId]) {
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

  // To now if we need to display the info panel
  const roomSelectionHtml = loadTemplate('room-selection', {
    userId: userId,
    showRoom1Info: (userData[userId].room1.status == Status.PENDING),
    showRoom2Info: (userData[userId].room2.status == Status.PENDING)
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
  const roomKey = roomId >0 ? `room${roomId}` : 'baseline';
  const roomStatus = userData[userId][roomKey].status;
  const startTime = userData[userId][roomKey].startTime;
  // Also check if another room is recording
  var alreadyRecording = false;
  var roomRecording = null;
  for (let i=1; i<=4; i++) {
    let key = `room${i}`
    if (i!=roomId && userData[userId][key].status == Status.RECORDING) {
      alreadyRecording = true;
      roomRecording = i;
    }
  }

  if (roomStatus== Status.PENDING) {
    const recordHtml = loadTemplate('record', {
      userId: userId,
      roomId: roomId,
      isRecording: false,
      startTime: startTime,
      alreadyRecording: alreadyRecording,
      roomRecording: roomRecording
    });

    res.send(recordHtml);
  } else if (roomStatus == Status.RECORDING) {
    const recordHtml = loadTemplate('record', {
      userId: userId,
      roomId: roomId,
      isRecording: true,
      startTime: startTime,
      alreadyRecording: alreadyRecording,
      roomRecording: roomRecording
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

  let baselineStatus;
  switch (userData[userId].baseline.status) {
    case Status.PENDING:
      baselineStatus = "pending";
      break;
    case Status.RECORDING:
      baselineStatus = "recording";
      break;
    case Status.SAVED:
      baselineStatus = "saved";
  }

  // Else redirect toward user registration
  const userRegistrationHtml = loadTemplate('user-registration', {
    userId: userId,
    baselineStatus: baselineStatus
  });
  
  res.send(userRegistrationHtml);
});

// Info panel
app.get('/info-panel/:stage/:userId', (req, res) => {
  let { stage, userId } = req.params;

  const infoPanelHtml = loadTemplate('info-panel', {
    userId: userId,
    stage: stage
  });

  res.send(infoPanelHtml);
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

  // Validate room ID (0-2)
  if (roomId < 0 || roomId > 2) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid room ID' 
    });
  }

  // Get the room key based on roomId
  const roomKey = roomId > 0 ? `room${roomId}` : 'baseline';

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

  // Validate room ID (0-2)
  if (roomId < 0 || roomId > 2) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid room ID' 
    });
  }

  // Get the room key based on roomId
  const roomKey = roomId > 0 ? `room${roomId}` : 'baseline';

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

  // Write stop in file to be sure it finished recording
  stopRecordingInFile(userId, roomId);

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

  // Validate room ID (0-2)
  if (roomId < 0 || roomId > 2) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid room ID' 
    });
  }

  // Get the room key based on roomId
  const roomKey = roomId > 0 ? `room${roomId}` : 'baseline';

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

  for (let roomId = 0; roomId <= 2; roomId++) {
    // Get the room key based on roomId
    const roomKey = roomId > 0 ? `room${roomId}` : 'baseline';

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
  console.log(`🚀 Serveur BPM démarré sur https://0.0.0.0:${SERVER_PORT}`);
  console.log(`📱 Accès local: https://localhost:${SERVER_PORT}`);
  console.log(`🌐 Accès réseau: https://[IP-DU-MAC]:${SERVER_PORT}`);
  console.log(`📊 Configuration: ${NUM_SEATS} sièges (identifiants 1 à ${NUM_SEATS})`);
  console.log(`🎵 OSC listening on port: ${OSC_PORT}`);
  console.log('');
  console.log('💡 Use --help or -h for command line options');
});