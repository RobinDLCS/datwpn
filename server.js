// 1. Importer les modules nécessaires
const express = require('express'); // Le framework pour créer notre serveur web
const cors = require('cors'); // Pour gérer les autorisations entre frontend et backend
const sqlite3 = require('sqlite3').verbose(); // Pour interagir avec la base de données SQLite

// 2. Initialiser l'application Express
const app = express();
const port = 3001; // Le port sur lequel ton serveur va écouter les requêtes.
                    // On choisit 3001 car React tourne souvent sur le port 3000.

// 3. Configurer les middlewares (des "intercepteurs" de requêtes)
app.use(cors()); // Permet à ton frontend (qui sera sur un autre port) de faire des requêtes au backend
app.use(express.json()); // Permet à Express de comprendre les requêtes avec du JSON (très courant en API)

// 4. Se connecter à la base de données SQLite
// 'database.db' est le nom du fichier qui contiendra ta base de données.
// Si le fichier n'existe pas, SQLite3 le créera automatiquement.
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Erreur lors de la connexion à la base de données :', err.message);
    } else {
        console.log('Connecté à la base de données SQLite.');
        // Créer les tables si elles n'existent pas
        db.run(`CREATE TABLE IF NOT EXISTS niglos (
            id_client INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS armes (
            id_wpn INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            type_ TEXT NOT NULL,
            prix REAL NOT NULL, -- On met REAL pour les prix car ils peuvent avoir des décimales
            quantite_disponible INTEGER NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS emprunts (
            id_emprunt INTEGER PRIMARY KEY AUTOINCREMENT,
            id_client INTEGER NOT NULL,
            id_wpn INTEGER NOT NULL,
            date_emprunt TEXT DEFAULT CURRENT_TIMESTAMP, -- Pour enregistrer la date de l'emprunt
            est_retourne INTEGER DEFAULT 0, -- 0 pour non retourné, 1 pour retourné
            FOREIGN KEY (id_client) REFERENCES niglos (id_client) ON DELETE RESTRICT, -- Empêche la suppression d'un client si lié à un emprunt
            FOREIGN KEY (id_wpn) REFERENCES armes (id_wpn) ON DELETE RESTRICT -- Empêche la suppression d'une arme si liée à un emprunt
        )`);
        console.log('Tables vérifiées/créées.');
    }
});

// 5. Définir la première route API de test
// Quand ton navigateur ou ton frontend fera une requête à 'http://localhost:3001/',
// le serveur répondra avec "Bienvenue sur l'API de gestion d'armes !"
app.get('/', (req, res) => {
    res.send('Ca va finir mal mon copain!');
});

// --- Routes API pour la gestion des niglos (clients) ---
// (On va ajouter d'autres routes ici plus tard pour ajouter/modifier/supprimer des niglos)

// Route pour récupérer tous les niglos
app.get('/niglos', (req, res) => {
    db.all('SELECT * FROM niglos', [], (err, rows) => {
        if (err) {
            res.status(400).json({"error":err.message});
            return;
        }
        res.json({
            "message":"success",
            "data":rows
        });
    });
});

// Route pour ajouter un nouveau niglo
app.post('/niglos', (req, res) => {
    const { nom, prenom } = req.body; // On récupère le nom et prénom envoyés par le frontend
    if (!nom || !prenom) {
        res.status(400).json({"error": "Nom et prénom sont requis."});
        return;
    }
    db.run(`INSERT INTO niglos (nom, prenom) VALUES (?, ?)`, [nom, prenom], function(err) {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.status(201).json({ // 201 Created est le code HTTP pour une création réussie
            "message": "success",
            "data": { id_client: this.lastID, nom, prenom } // Retourne l'ID généré et les infos
        });
    });
});

// Route pour récupérer un niglo par son ID
app.get('/niglos/:id', (req, res) => {
    const id = req.params.id; // L'ID est dans l'URL (ex: /niglos/1)
    db.get('SELECT * FROM niglos WHERE id_client = ?', [id], (err, row) => {
        if (err) {
            res.status(400).json({"error":err.message});
            return;
        }
        if (!row) {
            res.status(404).json({"message":"Niglo non trouvé."}); // 404 Not Found
            return;
        }
        res.json({
            "message":"success",
            "data":row
        });
    });
});

// Route pour modifier un niglo existant
app.put('/niglos/:id', (req, res) => {
    const id = req.params.id;
    const { nom, prenom } = req.body;
    if (!nom || !prenom) {
        res.status(400).json({"error": "Nom et prénom sont requis."});
        return;
    }
    db.run(
        `UPDATE niglos SET nom = ?, prenom = ? WHERE id_client = ?`,
        [nom, prenom, id],
        function(err) {
            if (err) {
                res.status(400).json({"error": err.message});
                return;
            }
            if (this.changes === 0) { // Si aucune ligne n'a été affectée, l'ID n'existe pas
                res.status(404).json({"message":"Niglo non trouvé."});
                return;
            }
            res.json({
                "message": "success",
                "changes": this.changes // Indique le nombre de lignes modifiées
            });
        }
    );
});

// Route pour supprimer un niglo (client)
app.delete('/niglos/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM niglos WHERE id_client = ?`, id, function(err) {
        if (err) {
            // Potentiellement une erreur de contrainte de clé étrangère si des emprunts existent pour ce client
            if (err.message.includes("FOREIGN KEY constraint failed")) {
                res.status(409).json({"error": "Impossible de supprimer ce client car il a des attributions actives ou passées. Supprimez ou retournez les attributions d'abord."});
            } else {
                res.status(400).json({"error": err.message});
            }
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({"message": "Client non trouvé ou aucune modification."});
        } else {
            res.json({"message": "Client supprimé avec succès", "changes": this.changes});
        }
    });
});

// --- Routes API pour la gestion des armes ---

// Route pour ajouter une nouvelle arme
app.post('/armes', (req, res) => {
    const { nom, type_, prix, quantite_disponible } = req.body;
    if (!nom || !type_ || prix === undefined || quantite_disponible === undefined) {
        res.status(400).json({"error": "Nom, type, prix et quantité sont requis."});
        return;
    }
    db.run(`INSERT INTO armes (nom, type_, prix, quantite_disponible) VALUES (?, ?, ?, ?)`,
        [nom, type_, prix, quantite_disponible],
        function(err) {
            if (err) {
                res.status(400).json({"error": err.message});
                return;
            }
            res.status(201).json({
                "message": "success",
                "data": { id_wpn: this.lastID, nom, type_, prix, quantite_disponible }
            });
        }
    );
});

// Route pour récupérer une arme par son ID
app.get('/armes/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM armes WHERE id_wpn = ?', [id], (err, row) => {
        if (err) {
            res.status(400).json({"error":err.message});
            return;
        }
        if (!row) {
            res.status(404).json({"message":"Arme non trouvée."});
            return;
        }
        res.json({
            "message":"success",
            "data":row
        });
    });
});

// Route pour modifier une arme existante
app.put('/armes/:id', (req, res) => {
    const id = req.params.id;
    const { nom, type_, prix, quantite_disponible } = req.body;
    if (!nom || !type_ || prix === undefined || quantite_disponible === undefined) {
        res.status(400).json({"error": "Nom, type, prix et quantité sont requis."});
        return;
    }
    db.run(
        `UPDATE armes SET nom = ?, type_ = ?, prix = ?, quantite_disponible = ? WHERE id_wpn = ?`,
        [nom, type_, prix, quantite_disponible, id],
        function(err) {
            if (err) {
                res.status(400).json({"error": err.message});
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({"message":"Arme non trouvée."});
                return;
            }
            res.json({
                "message": "success",
                "changes": this.changes
            });
        }
    );
});

// Route pour récupérer toutes les armes
app.get('/armes', (req, res) => {
    db.all('SELECT * FROM armes', [], (err, rows) => {
        if (err) {
            res.status(400).json({"error":err.message});
            return;
        }
        res.json({
            "message":"success",
            "data":rows
        });
    });
});

// Route pour supprimer une arme
app.delete('/armes/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM armes WHERE id_wpn = ?`, id, function(err) {
        if (err) {
            // Potentiellement une erreur de contrainte de clé étrangère si des emprunts existent pour cette arme
            if (err.message.includes("FOREIGN KEY constraint failed")) {
                res.status(409).json({"error": "Impossible de supprimer cette arme car elle est ou a été attribuée. Retournez l'arme avant de la supprimer."});
            } else {
                res.status(400).json({"error": err.message});
            }
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({"message": "Arme non trouvée ou aucune modification."});
        } else {
            res.json({"message": "Arme supprimée avec succès", "changes": this.changes});
        }
    });
});

// --- Routes API pour la gestion des emprunts ---

// Route pour attribuer une arme à un client (créer un emprunt)
app.post('/emprunts', (req, res) => {
    const { id_client, id_wpn } = req.body; // On a besoin de l'ID du client et de l'ID de l'arme

    if (!id_client || !id_wpn) {
        res.status(400).json({"error": "ID du client et ID de l'arme sont requis pour l'emprunt."});
        return;
    }

    // Étape 1 : Vérifier si le client existe
    db.get('SELECT * FROM niglos WHERE id_client = ?', [id_client], (err, client) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        if (!client) {
            res.status(404).json({"message": "Client non trouvé."});
            return;
        }

        // Étape 2 : Vérifier si l'arme existe et si le stock est suffisant
        db.get('SELECT * FROM armes WHERE id_wpn = ?', [id_wpn], (err, arme) => {
            if (err) {
                res.status(400).json({"error": err.message});
                return;
            }
            if (!arme) {
                res.status(404).json({"message": "Arme non trouvée."});
                return;
            }
            if (arme.quantite_disponible <= 0) {
                res.status(409).json({"message": "Stock insuffisant pour cette arme."}); // 409 Conflict
                return;
            }

            // Étape 3 : Insérer l'emprunt dans la table emprunts
            db.run(`INSERT INTO emprunts (id_client, id_wpn) VALUES (?, ?)`,
                [id_client, id_wpn],
                function(err) {
                    if (err) {
                        res.status(400).json({"error": err.message});
                        return;
                    }

                    const newEmpruntId = this.lastID; // Récupère l'ID du nouvel emprunt

                    // Étape 4 : Diminuer le stock de l'arme
                    db.run(`UPDATE armes SET quantite_disponible = quantite_disponible - 1 WHERE id_wpn = ?`,
                        [id_wpn],
                        function(err) {
                            if (err) {
                                // Si cette étape échoue, c'est problématique. Il faudrait une gestion plus robuste
                                // (transaction) pour s'assurer que les deux opérations (emprunt et diminution stock)
                                // réussissent ou échouent ensemble. Pour l'instant, on gère l'erreur simplement.
                                res.status(500).json({"error": "Erreur lors de la mise à jour du stock de l'arme : " + err.message});
                                return;
                            }
                            res.status(201).json({
                                "message": "Emprunt enregistré et stock mis à jour avec succès.",
                                "data": {
                                    id_emprunt: newEmpruntId,
                                    id_client,
                                    id_wpn,
                                    nouvelle_quantite: arme.quantite_disponible - 1
                                }
                            });
                        }
                    );
                }
            );
        });
    });
});

// Route pour récupérer tous les emprunts en cours (non retournés)
app.get('/emprunts', (req, res) => {
    // On utilise une jointure pour récupérer les noms du client et de l'arme
    // On filtre par est_retourne = 0 pour les emprunts actifs
    const sql = `
        SELECT
            e.id_emprunt,
            n.nom AS nom_client,
            n.prenom AS prenom_client,
            a.nom AS nom_arme,
            a.type_ AS type_arme,
            e.date_emprunt
        FROM emprunts e
        JOIN niglos n ON e.id_client = n.id_client
        JOIN armes a ON e.id_wpn = a.id_wpn
        WHERE e.est_retourne = 0
        ORDER BY e.date_emprunt DESC`; // Les plus récents en premier

    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({
            "message":"success",
            "data":rows
        });
    });
});

// Route pour marquer un emprunt comme "retourné" (future extension)
app.put('/emprunts/:id/retour', (req, res) => {
    const id = req.params.id; // ID de l'emprunt à marquer comme retourné

    db.get('SELECT * FROM emprunts WHERE id_emprunt = ?', [id], (err, emprunt) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        if (!emprunt) {
            res.status(404).json({"message": "Emprunt non trouvé."});
            return;
        }
        if (emprunt.est_retourne === 1) {
            res.status(400).json({"message": "Cet emprunt est déjà marqué comme retourné."});
            return;
        }

        // Marquer l'emprunt comme retourné
        db.run(`UPDATE emprunts SET est_retourne = 1 WHERE id_emprunt = ?`,
            [id],
            function(err) {
                if (err) {
                    res.status(400).json({"error": err.message});
                    return;
                }
                if (this.changes === 0) {
                    res.status(404).json({"message":"Emprunt non trouvé."});
                    return;
                }

                // Augmenter le stock de l'arme correspondante
                db.run(`UPDATE armes SET quantite_disponible = quantite_disponible + 1 WHERE id_wpn = ?`,
                    [emprunt.id_wpn], // On utilise l'id_wpn de l'emprunt qu'on vient de récupérer
                    function(err) {
                        if (err) {
                            res.status(500).json({"error": "Erreur lors de la mise à jour du stock de l'arme (retour) : " + err.message});
                            return;
                        }
                        res.json({
                            "message": "Emprunt marqué comme retourné et stock mis à jour.",
                            "changes": this.changes
                        });
                    }
                );
            }
        );
    });
});


// (Optionnel) Route pour récupérer TOUS les emprunts (y compris les retournés)
// Utile pour un historique, mais moins pour la vue "actifs"
app.get('/emprunts/historique', (req, res) => {
    const sql = `
        SELECT
            e.id_emprunt,
            n.nom AS nom_client,
            n.prenom AS prenom_client,
            a.nom AS nom_arme,
            a.type_ AS type_arme,
            e.date_emprunt,
            e.est_retourne
        FROM emprunts e
        JOIN niglos n ON e.id_client = n.id_client
        JOIN armes a ON e.id_wpn = a.id_wpn
        ORDER BY e.date_emprunt DESC`;

    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({
            "message":"success",
            "data":rows
        });
    });
});
// --- Routes API pour les statistiques du tableau de bord ---

// Total armes
app.get('/stats/total-armes', (req, res) => {
    db.get('SELECT COUNT(id_wpn) AS total FROM armes', [], (err, row) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({"message":"success", "data": row.total});
    });
});

// Types d'armes (distincts)
app.get('/stats/types-armes', (req, res) => {
    db.get('SELECT COUNT(DISTINCT type_) AS total FROM armes', [], (err, row) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({"message":"success", "data": row.total});
    });
});

// Total clients
app.get('/stats/total-clients', (req, res) => {
    db.get('SELECT COUNT(id_client) AS total FROM niglos', [], (err, row) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({"message":"success", "data": row.total});
    });
});

// Attributions actives (emprunts non retournés)
app.get('/stats/attributions-actives', (req, res) => {
    db.get('SELECT COUNT(id_emprunt) AS total FROM emprunts WHERE est_retourne = 0', [], (err, row) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({"message":"success", "data": row.total});
    });
});

// 6. Démarrer le serveur
app.listen(port, () => {
    console.log(`Serveur backend démarré sur http://localhost:${port}`);
});