// Serveur Node.js simple pour prototype BPM
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Fonction pour charger les données BPM depuis le recording de vib-eMotion
function loadBpmDataFromFiles() {

  var maxSeat = 0;

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
                  bpmData[id].data.push(parseInt(bpm));
                  bpmData[id].time.push(parseInt(timestamp)); // Unix timestamp format
              } else {
                  
                  if (id > maxSeat) {
                      maxSeat = id;
                  }
                  
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
    
  if (maxSeat == 0) {
    console.error('Error no data in the file');
  }

  return [bpmData, maxSeat];
}

// Chargement des données BPM
const data = loadBpmDataFromFiles();
const bpmData = data[0];
const NUM_SEATS = data[1];

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
    res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
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
      time: bpmData[userId].time
    });
  } else {
    res.status(404).json({ success: false, message: 'Données BPM non trouvées' });
  }
});

// Authentification automatique via lien direct avec interface identique
app.get('/auth/:userId', (req, res) => {
  let { userId } = req.params;

  if (!bpmData[userId]) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erreur - BPM</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f0f0f0; padding: 20px; text-align: center; }
          .container { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: auto; }
          .error { color: #721c24; background: #f8d7da; padding: 15px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>❌ Utilisateur non trouvé</h2>
          <div class="error">L'identifiant "${req.params.userId}" n'existe pas.</div>
          <p>Identifiants valides : 1 à ${NUM_SEATS}</p>
          <a href="/">← Retour à l'accueil</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  const validUsersArray = Object.keys(bpmData);
  const validUsersString = validUsersArray.map(u => `'${u}'`).join(', ');

  res.send(`
    <!DOCTYPE html>
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

        <!-- Formulaire d'authentification masqué -->
        <div id="authSection" style="display:none;">
          <h3>Authentification</h3>
          <input type="text" id="userIdInput" placeholder="Entrez votre identifiant (1 à ${NUM_SEATS})" />
          <button class="btn-primary" onclick="authenticateUser()">Se connecter</button>
          <div id="authStatus"></div>
        </div>

        <!-- Section principale -->
        <div id="mainSection">
          <div class="chart-container">
            <h3 id="chartTitle">Sélectionnez un profil</h3>
            <canvas id="bpmChart" width="400" height="200"></canvas>
          </div>

          <button class="btn-success" onclick="logout()">Déconnexion</button>
        </div>
      </div>

    <script>
      let chart = null;
      let currentUser = '${userId}';
      let connectionCount = 1;

      const validUsers = [${validUsersString}];

      // Authentification automatique au chargement de la page
      window.onload = function() {
        authenticateUserAuto('${userId}');
      };

      function authenticateUserAuto(userId) {
        fetch(\`/api/auth/\${userId}\`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              currentUser = userId;
              connectionCount++;
              loadBpmData(userId);
            } else {
              console.error('Échec authentification automatique');
            }
          })
          .catch(error => {
            console.error('Erreur authentification automatique:', error);
          });
      }

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
        document.getElementById('chartTitle').textContent = 'Sélectionnez un profil';
        window.location.href = '/';
      }

      function loadBpmData(userId) {
        fetch(\`/api/bpm/\${userId}\`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              document.getElementById('chartTitle').textContent = \`📊 \${data.profile} - BPM au cours du spectacle\`;
              updateChart(data.bpmData, data.time, data.profile);
            }
          })
          .catch(error => console.error('Erreur BPM:', error));
      }

      function updateChart(bpmData, time, profileName) {
        // Prendre le premier timestamp comme origine
        const startTime = time[0];
  
        //console.log('bpmData:', bpmData);
        console.log('time:', time[0]);
  
        // Convertir les timestamps en temps relatif depuis le début (en heures:minutes)
        const labels = time.map(timestamp => {
          const elapsedSeconds = (timestamp - startTime)/1000;
          const hours = Math.floor(elapsedSeconds / 3600);
          const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        
          return hours + ':' + minutes.toString().padStart(2, '0');
        });

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
              tension: 0.4,
              pointRadius: 0,           // Masque les points
              pointHoverRadius: 5       // Affiche les points seulement au survol
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
                  text: 'Temps écoulé (h:min)'
                },
                ticks: {
                  maxTicksLimit: 10, // Limite le nombre de labels affichés pour éviter l'encombrement
                  maxRotation: 45,   // Rotation des labels si nécessaire
                  minRotation: 0
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
  
      }, 5000);
    </script>
    </body>
    </html>
  `);
});

// Routes d'accès direct
app.get('/user/:userId', (req, res) => {
  const { userId } = req.params;

  const match = userId.match(/^user(\d+)$/);
    
  // TODO: à changer mais veut dire de changer les qr code
  if (!match) {
    res.status(404).send('<h2>❌ Utilisateur non trouvé</h2>');
    return;
  } else if (!bpmData[match[1]]) {
    res.status(404).send('<h2>❌ Utilisateur non trouvé</h2>');
    return;
  }

  const userProfile = bpmData[match[1]].name;
  const bpmValues = bpmData[match[1]].data;
  const labels = bpmValues.map((_, i) => `T${i + 1}`);
  const bpmString = JSON.stringify(bpmValues);
  const labelString = JSON.stringify(labels);

  // Redirection
  res.redirect(`/auth/${match[1]}`);
});

// Route principale avec liens directs
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
            .links-section { margin-bottom: 30px; padding: 20px; background: #e8f5e8; border-radius: 8px; }
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
          <h3>Authentification manuelle</h3>
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
              updateChart(data.bpmData, data.time, data.profile);
            }
          })
          .catch(error => console.error('Erreur BPM:', error));
      }

      function updateChart(bpmData, time, profileName) {
        // Prendre le premier timestamp comme origine
        const startTime = time[0];
  
        //console.log('bpmData:', bpmData);
        console.log('time:', time[0]);
  
        // Convertir les timestamps en temps relatif depuis le début (en heures:minutes)
        const labels = time.map(timestamp => {
          const elapsedSeconds = (timestamp - startTime)/1000;
          const hours = Math.floor(elapsedSeconds / 3600);
          const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        
          return hours + ':' + minutes.toString().padStart(2, '0');
        });

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
              tension: 0.4,
              pointRadius: 0,           // Masque les points
              pointHoverRadius: 5       // Affiche les points seulement au survol
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
                  text: 'Temps écoulé (h:min)'
                },
                ticks: {
                  maxTicksLimit: 10, // Limite le nombre de labels affichés pour éviter l'encombrement
                  maxRotation: 45,   // Rotation des labels si nécessaire
                  minRotation: 0
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
});
