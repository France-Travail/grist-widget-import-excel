// ==============================
// 🌐 IMPORTS
// ==============================
const express = require("express");
const path = require("path");

// ==============================
// ⚙️ CONFIGURATION DE BASE
// ==============================
const app = express();
const PORT = 8000;

// 📁 Définition du dossier racine à servir (parent du fichier courant)
const basePath = path.join(__dirname, "..");

// ==============================
// 🧱 MIDDLEWARES
// ==============================
// Sert tous les fichiers statiques depuis la racine du projet
app.use(express.static(basePath));

// ==============================
// 🌍 ROUTES
// ==============================
// Route principale : renvoie index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(basePath, "index.html"));
});

// ==============================
// 🚀 LANCEMENT DU SERVEUR
// ==============================
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
