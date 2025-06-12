// Serveur Node.js simple pour prototype BPM
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Configuration du nombre de sièges (modifiable au lancement)
const NUM_SEATS = process.env.NUM_SEATS ? parseInt(process.env.NUM_SEATS) : getNumSeatsFromArgs();

function getNumSeatsFromArgs() {
  const args = process.argv.slice(2);
  const numSeatsArg = args.find(arg => arg.startsWith('--seats='));
  if (numSeatsArg) {
    return parseInt(numSeatsArg.split('=')[1]);
  }
  // Valeur par défaut si aucun argument fourni
  return 2;
}

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Fonction pour charger les données BPM depuis les fichiers
function loadBpmDataFromFiles() {
  const bpmData = {};
  
  for (let i = 1; i <= NUM_SEATS; i++) {
    const userId = `user${i}`;
    const filename = `data/seat_${i}.json`;
    
    try {
      if (fs.existsSync(filename)) {
        const fileContent = fs.readFileSync(filename, 'utf8');
        const data = JSON.parse(fileContent);
        bpmData[userId] = {
          name: `Siège ${i}`,
          data: data.bpmData || []
        };
        console.log(`✅ Données chargées pour ${userId} depuis ${filename}`);
      } else {
        // Créer un fichier exemple s'il n'existe pas
        const exampleData = {
          name: `Siège ${i}`,
          bpmData: generateExampleBpmData()
        };
        
        // Créer le dossier data s'il n'existe pas
        const dataDir = path.dirname(filename);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        
        fs.writeFileSync(filename, JSON.stringify(exampleData, null, 2));
        bpmData[userId] = {
          name: `Siège ${i}`,
          data: exampleData.bpmData
        };
        console.log(`📝 Fichier exemple créé pour ${userId}: ${filename}`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors du chargement de ${filename}:`, error.message);
      // Données par défaut en cas d'erreur
      bpmData[userId] = {
        name: `Siège ${i}`,
        data: generateExampleBpmData()
      };
    }
  }
  
  return bpmData;
}

// Génère des données BPM d'exemple
function generateExampleBpmData() {
  return Array.from({ length: 15 }, () => Math.floor(Math.random() * 60) + 60);
}

// Chargement des données BPM
const bpmData = loadBpmDataFromFiles();

// Routes API
app.get('/api/auth/:userId', (req, res) => {
  const { userId } = req.params;
  
  if (bpmData[userId]) {
    res.json({
      success: true,
      userId: userId,
      profile: bpmData[userId].name,
      qrCode: `QR-${userId.toUpperCase()}-${Date.now()}`
    });
  } else {
    res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
  }
});

app.get('/api/bpm/:userId', (req, res) => {
  const { userId } = req.params;
  
  if (bpmData[userId]) {
    // Simulation - ajoute un peu de variation
    const variation = Math.floor(Math.random() * 6) - 3;
    const currentData = bpmData[userId].data.map(val => val + variation);
    
    res.json({
      success: true,
      userId: userId,
      profile: bpmData[userId].name,
      bpmData: currentData,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(404).json({ success: false, message: 'Données BPM non trouvées' });
  }
});

// Route pour obtenir la liste des utilisateurs disponibles
app.get('/api/users', (req, res) => {
  const users = Object.keys(bpmData).map(userId => ({
    id: userId,
    name: bpmData[userId].name
  }));
  res.json({ users, totalSeats: NUM_SEATS });
});

// TODO:
// Routes d'accès direct
app.get('/user/:userId', (req, res) => {
  const { userId } = req.params;

  if (!bpmData[userId]) {
    res.status(404).send('<h2>❌ Utilisateur non trouvé</h2>');
    return;
  }

  const userProfile = bpmData[userId].name;
  const bpmValues = bpmData[userId].data;
  const labels = bpmValues.map((_, i) => `T${i + 1}`);
  const bpmString = JSON.stringify(bpmValues);
  const labelString = JSON.stringify(labels);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${userProfile} - BPM</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
      <style>
        body { font-family: Arial, sans-serif; background: #f0f0f0; padding: 20px; }
        .container { background: white; padding: 20px; border-radius: 10px; max-width: 700px; margin: auto; }
        h1 { font-size: 24px; }
        canvas { margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ Authentifié automatiquement : ${userProfile}</h1>
        <p><strong>Utilisateur:</strong> ${userId}</p>
        <canvas id="bpmChart" width="600" height="300"></canvas>
      </div>
      <script>
        const ctx = document.getElementById('bpmChart').getContext('2d');
        const bpmData = ${bpmString};
        const labels = ${labelString};

        new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: '${userProfile}',
              data: bpmData,
              borderColor: '#36A2EB',
              backgroundColor: 'rgba(54, 162, 235, 0.1)',
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: { min: 50, max: 180 },
              x: { title: { display: true, text: 'Temps' } }
            }
          }
        });
      </script>
    </body>
    </html>
  `);
});


// Route principale
app.get('/', (req, res) => {
  const validUsersArray = Object.keys(bpmData);
  const validUsersString = validUsersArray.map(u => `'${u}'`).join(', ');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Prototype Emotional Map</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; }
            .auth-section { margin-bottom: 30px; padding: 20px; background: #e8f4fd; border-radius: 8px; }
            .chart-container { margin: 20px 0; }
            button { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; }
            .btn-primary { background: #007bff; color: white; }
            .btn-success { background: #28a745; color: white; }
            .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; }
            .error { background: #f8d7da; color: #721c24; }
            .info { background: #d1ecf1; color: #0c5460; padding: 10px; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
      <div class="container">
        <h1>🫀 Prototype Emotional Map</h1>
        
        <div class="info">
          <strong>Configuration:</strong> ${NUM_SEATS} sièges disponibles (identifiants: 1 à ${NUM_SEATS})
        </div>

        <!-- Formulaire d'authentification -->
        <div id="authSection">
          <h3>Authentification</h3>
          <input type="text" id="userIdInput" placeholder="Entrez votre identifiant (1 à ${NUM_SEATS})" />
          <button class="btn-primary" onclick="authenticateUser()">Se connecter</button>
          <div id="authStatus"></div>
        </div>

        <!-- Section principale masquée au départ -->
        <div id="mainSection" style="display:none;">
          <div class="chart-container">
            <h3 id="chartTitle">Sélectionnez un profil</h3>
            <canvas id="bpmChart" width="400" height="200"></canvas>
          </div>

          <button class="btn-success" onclick="logout()">Déconnexion</button>
        </div>
      </div>

    <script>
      let chart = null;
      let currentUser = null;
      let connectionCount = 0;

      const validUsers = [${validUsersString}];

      function authenticateUser() {
        let userId = document.getElementById('userIdInput').value.trim();
        const statusDiv = document.getElementById('authStatus');

        // Convertir l'ID numérique en format userX
        if (/^\d+$/.test(userId)) {
          const seatNumber = parseInt(userId);
          if (seatNumber >= 1 && seatNumber <= ${NUM_SEATS}) {
            userId = \`user\${seatNumber}\`;
          }
        }

        if (!validUsers.includes(userId)) {
          statusDiv.innerHTML = '<div class="status error">❌ Identifiant invalide. Utilisez un nombre de 1 à ${NUM_SEATS}.</div>';
          return;
        }

        fetch(\`/api/auth/\${userId}\`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              statusDiv.innerHTML = \`<div class="status success">✅ Authentifié: \${data.profile} (QR: \${data.qrCode})</div>\`;
              currentUser = userId;
              connectionCount++;
              showMainSection();
              loadBpmData(userId);
            } else {
              statusDiv.innerHTML = '<div class="status error">❌ Échec authentification</div>';
            }
          })
          .catch(error => {
            console.error('Erreur:', error);
            statusDiv.innerHTML = '<div class="status error">❌ Erreur réseau</div>';
          });
      }

      function showMainSection() {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainSection').style.display = 'block';
      }

      function logout() {
        currentUser = null;
        connectionCount = 0;
        if(chart) {
          chart.destroy();
          chart = null;
        }
        document.getElementById('authStatus').innerHTML = '';
        document.getElementById('userIdInput').value = '';
        document.getElementById('chartTitle').textContent = 'Sélectionnez un profil';
        document.getElementById('mainSection').style.display = 'none';
        document.getElementById('authSection').style.display = 'block';
      }

      function loadBpmData(userId) {
        fetch(\`/api/bpm/\${userId}\`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              document.getElementById('chartTitle').textContent = \`📊 \${data.profile} - BPM au cours du spectacle\`;
              updateChart(data.bpmData, data.profile);
            }
          })
          .catch(error => console.error('Erreur BPM:', error));
      }

      function updateChart(bpmData, profileName) {
        const labels = bpmData.map((_, index) => \`T\${index + 1}\`);

        if (chart) {
          chart.destroy();
        }

        chart = new Chart(document.getElementById('bpmChart').getContext('2d'), {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: profileName,
              data: bpmData,
              borderColor: '#36A2EB',
              backgroundColor: 'rgba(54, 162, 235, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: false,
                min: 50,
                max: 180,
                title: {
                  display: true,
                  text: 'BPM'
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Temps'
                }
              }
            },
            plugins: {
              legend: {
                display: false  // Légende masquée
              }
            }
          }
        });
      }

      // Mise à jour automatique toutes les 5 secondes
      setInterval(() => {
//        if (currentUser) {
//          loadBpmData(currentUser);
//        }
      }, 5000);
    </script>
    </body>

    </html>
  `);
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur BPM démarré sur http://0.0.0.0:${PORT}`);
  console.log(`📱 Accès local: http://localhost:${PORT}`);
  console.log(`🌐 Accès réseau: http://[IP-DU-MAC]:${PORT}`);
  console.log(`📊 Configuration: ${NUM_SEATS} sièges (identifiants 1 à ${NUM_SEATS})`);
  console.log(`📁 Fichiers de données: ./data/seat_1.json à ./data/seat_${NUM_SEATS}.json`);
});
