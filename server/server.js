// ==============================
// 🌐 IMPORTS
// ==============================
const express = require("express");
const path = require("path");

// ==============================
// ⚙️ CONFIGURATION DE BASE
// ==============================
const app = express();
const PORT = 8001;

// 📁 Définition du dossier public à servir
const publicPath = path.join(__dirname, "..", "public");
const srcPath = path.join(__dirname, "..", "src");

// ==============================
// 🧱 MIDDLEWARES
// ==============================
// Sert les fichiers statiques depuis public/
app.use(express.static(publicPath));
// Sert aussi les sources depuis src/ pour les imports ES6
app.use("/src", express.static(srcPath));

// ==============================
// 🌍 ROUTES
// ==============================
// Route principale : renvoie index.html depuis public/
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ==============================
// 🚀 LANCEMENT DU SERVEUR
// ==============================
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
