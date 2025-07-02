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

// Fonction pour charger et traiter les templates HTML
function loadTemplate(templateName, variables = {}) {
  try {
    const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
    let template = fs.readFileSync(templatePath, 'utf-8');
    
    // Remplacer les variables dans le template
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
  const averageBpm = calculateAverageBpm(bpmData, 1000);
    
  return [bpmData, maxID, averageBpm];
}

// Compute average BPM for a given interval
function calculateAverageBpm(bpmData, intervalMs = 1000) {
  const userIds = Object.keys(bpmData);
  
  if (userIds.length === 0) {
    return { data: [], time: [] };
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

  if (minTimestamp === Infinity) {
    return { data: [], time: [] };
  }

  const averageData = [];
  const averageTime = [];

  // Loop over all time intervals
  for (let currentTime = minTimestamp; currentTime <= maxTimestamp; currentTime += intervalMs) {
    const intervalEnd = currentTime + intervalMs;
    const userAverages = [];

    // For each user compute their avg on this interval
    userIds.forEach(id => {
      const userData = bpmData[id];
      const bpmValuesInInterval = [];

      // Find all values within this interval
      for (let i = 0; i < userData.time.length; i++) {
        const timestamp = userData.time[i];
        if (timestamp >= currentTime && timestamp < intervalEnd) {
          bpmValuesInInterval.push(userData.data[i]);
        }
      }

      // If user has data in this interval compute avg
      if (bpmValuesInInterval.length > 0) {
        const userAverage = bpmValuesInInterval.reduce((sum, bpm) => sum + bpm, 0) / bpmValuesInInterval.length;
        userAverages.push(userAverage);
      }
    });

    // If at least one user has data in this interval
    if (userAverages.length > 0) {
      const globalAverage = userAverages.reduce((sum, avg) => sum + avg, 0) / userAverages.length;
      averageData.push(Math.round(globalAverage * 100) / 100); // Arrondi à 2 décimales
      averageTime.push(currentTime);
    }
  }

  return {
    name: 'Moyenne globale',
    data: averageData,
    time: averageTime
  };
}

////
// BPM DATA LOADING AT STARTUP
////

const data = loadBpmDataFromFiles();
const bpmData = data[0];
const NUM_SEATS = data[1];
const avgBpm = data[2];

////
// ROUTES 
////

// Routes API connection
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

// Authentification automatique via lien direct
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

// Routes d'accès direct
app.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const match = userId.match(/^user(\d+)$/);
    
  if (!match) {
    res.status(404).send('<h2>❌ User not found</h2>');
    return;
  } else if (!bpmData[match[1]]) {
    res.status(404).send('<h2>❌ User not found</h2>');
    return;
  }

  // Redirection
  res.redirect(`/auth/${match[1]}`);
});

// Route principale
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

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur BPM démarré sur http://0.0.0.0:${PORT}`);
  console.log(`📱 Accès local: http://localhost:${PORT}`);
  console.log(`🌐 Accès réseau: http://[IP-DU-MAC]:${PORT}`);
  console.log(`📊 Configuration: ${NUM_SEATS} sièges (identifiants 1 à ${NUM_SEATS})`);
});