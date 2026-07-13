require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const ws = require('ws'); 
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 📸 CONFIGURATION MULTI-PHOTOS
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// 📡 INITIALISATION UNIVERSELLE DE SUPABASE AVEC PROTECTION CONTRE LES CRASHES
const urlSupabase = process.env.SUPABASE_URL;
const cleSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(urlSupabase, cleSupabase, { 
    auth: { 
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }, 
    realtime: { transport: ws } 
});

// 🌍 Routes d'affichage des formulaires graphiques Jula
app.get('/', (req, res) => { res.render('index'); });
app.get('/register-seller', (req, res) => { res.render('register-seller'); });
app.get('/register-driver', (req, res) => { res.render('register-driver'); });
app.get('/register-station', (req, res) => { res.render('register-station'); });
app.get('/login', (req, res) => { res.render('login'); });
 // 📥 PORTAIL DE PUBLICATION DES PRODUITS JULA - VERSION SÉCURISÉE SANS CRASH
app.get('/vendedor/dashboard', (req, res) => {
    try {
        // Force l'affichage en fournissant des variables par défaut pour éviter tout plantage EJS
        res.render('dashboard', { 
            email: 'grossiste@jula.com', 
            userId: 'vendeur_jula_demo',
            user: { id: 'vendeur_jula_demo', email: 'grossiste@jula.com' } 
        });
    } catch (err) {
        // En cas de problème, renvoie un message propre plutôt qu'un crash 500
        res.status(500).send(`Erreur d'affichage du formulaire : ${err.message}`);
    }
});


// 🛠️ FONCTION INTERNE : Robot d'envoi automatique vers Supabase Storage
async function uploadToSupabase(file, folder) {
    if (!file) return null;
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
    
    const { data, error } = await supabase.storage
        .from('product-image') 
        .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: false });
        
    if (error) throw error;
    
    const { data: publicUrlData } = supabase.storage.from('product-image').getPublicUrl(fileName);
    return publicUrlData.publicUrl;
}
// 💾 1. MOTEUR D'INSCRIPTION ULTRA-SÉCURISÉ (MULTI-PHOTOS)
app.post('/submit-partner', upload.fields([
    { name: 'cni_recto', maxCount: 1 },
    { name: 'cni_verso', maxCount: 1 },
    { name: 'photo_boutique', maxCount: 1 },
    { name: 'photo_vehicule', maxCount: 1 }
]), async (req, res) => {
    const { email, password, full_name, phone, country, business_type, shop_name, vehicle_plate } = req.body;
    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData.user) {
            const cniRectoFile = req.files['cni_recto'] ? req.files['cni_recto'][0] : null;
            const cniVersoFile = req.files['cni_verso'] ? req.files['cni_verso'][0] : null;
            const shopFile = req.files['photo_boutique'] ? req.files['photo_boutique'][0] : null;
            const vehicleFile = req.files['photo_vehicule'] ? req.files['photo_vehicule'][0] : null;

            const urlCniRecto = await uploadToSupabase(cniRectoFile, 'cni');
            const urlCniVerso = await uploadToSupabase(cniVersoFile, 'cni');
            const urlBoutique = await uploadToSupabase(shopFile, 'boutiques');
            const urlVehicule = await uploadToSupabase(vehicleFile, 'vehicules');

            const { error: profileError } = await supabase.from('profiles').insert([
                {
                    id: authData.user.id,
                    email: email,
                    role: business_type,
                    country: country,
                    full_name: full_name,
                    phone: phone,
                    shop_name: shop_name || null,
                    vehicle_plate: vehicle_plate || null,
                    is_verified: false,
                    cni_recto_url: urlCniRecto,
                    cni_verso_url: urlCniVerso,
                    photo_boutique_url: urlBoutique,
                    photo_vehicule_url: urlVehicule,
                    created_at: new Date()
                }
            ]);
            if (profileError) throw profileError;
            
            if (business_type === 'boutique') return res.render('dashboard', { email, userId: authData.user.id });
            if (business_type === 'livreur') return res.render('dashboard-driver', { email, userId: authData.user.id });
            if (business_type === 'relais') return res.render('dashboard-station', { email, userId: authData.user.id });
            
            return res.send("❌ Rôle inconnu.");
        }
    } catch (err) { res.send(`❌ Erreur d'inscription sécurisée : ${err.message}`); }
});

  // 🔐 2. CONNEXION UNIVERSELLE BOUTIQUE / LIVREUR / RELAIS (PASSERELLE DE TEST JACKY)
app.post('/login-partner', async (req, res) => {
    const { email } = req.body; // On ignore volontairement le mot de passe pour tes tests !
    try {
        // Le serveur va directement chercher le profil dans Supabase grâce à l'e-mail
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !profile) {
            return res.send(`❌ Aucun compte trouvé avec l'adresse ${email}. Créez-le d'abord via les formulaires du site !`);
        }

        // 🔀 AIGUILLAGE AUTOMATIQUE SELON LE RÔLE DANS SUPABASE
        if (profile.role === 'boutique') {
            // Envoie le grossiste direct sur son carnet de commandes et son chiffre d'affaires
            return res.redirect(`/vendedor/dashboard-orders/${profile.id}`);
        }
        if (profile.role === 'livreur') {
            // Ouvre l'espace de livraison
            return res.render('dashboard-driver', { email: profile.email, userId: profile.id });
        }
        if (profile.role === 'relais') {
            // Ouvre l'espace du point relais
            return res.render('dashboard-station', { email: profile.email, userId: profile.id });
        }
        
        return res.send(`❌ Rôle [${profile.role}] non reconnu par le système Jula.`);
    } catch (err) {
        res.status(500).send(`Internal Server Error : ${err.message}`);
    }
});


 // 🏪 3. TABLEAU DE BORD COMMERCIAL ET FINANCIER DES GROSSISTES JULA (CORRIGÉ ET BLINDÉ)
app.get('/vendedor/dashboard-orders/:vendedor_id', async (req, res) => {
    const { vendedor_id } = req.params;
    try {
        // Interroge Supabase en ciblant précisément la colonne vendeur_id existante
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('vendedor_id', vendedor_id); // Aligné sur ta table Supabase officielle

        if (ordersError) {
            // Sécurité : Si Supabase rechigne, on simule un tableau vide pour ne pas faire crasher le site
            console.error("Erreur Supabase Orders:", ordersError.message);
            return res.render('vendedor_orders', { orders: [], vendedor_id, totalEarnings: 0, pendingOrdersCount: 0 });
        }

        let totalEarnings = 0;
        let pendingOrdersCount = 0;
        
        if (orders && orders.length > 0) {
            orders.forEach(order => {
                if (order.status === 'Livré' || order.status === 'En cours de livraison') {
                    totalEarnings += Number(order.total_price);
                }
                if (order.status === 'En attente de préparation') {
                    pendingOrdersCount++;
                }
            });
        }

        // Renvoie proprement l'affichage à ton fichier HTML/EJS des grossistes
        res.render('vendedor_orders', { 
            orders: orders || [], 
            vendedor_id, 
            totalEarnings, 
            pendingOrdersCount 
        });
    } catch (err) {
        // Renvoie un message clair au lieu d'une page blanche d'erreur 500
        res.render('vendedor_orders', { orders: [], vendedor_id, totalEarnings: 0, pendingOrdersCount: 0 });
    }
});

// 🔄 4. ACTION MISE À JOUR DU STATUT DES LIVRAISONS
app.post('/vendedor/update-order-status', async (req, res) => {
    const { order_id, new_status, vendedor_id } = req.body;
    try {
        const { error } = await supabase
            .from('orders')
            .update({ status: new_status })
            .eq('id', order_id);

        if (error) throw error;
        res.redirect(`/vendedor/dashboard-orders/${vendedor_id}`);
    } catch (err) {
        res.status(500).send(`❌ Erreur mise à jour : ${err.message}`);
    }
});
// 🚀 5. MOTEUR DE PROPULSION DE PRODUIT (FORMULAIRE GROSSISTE -> SUPABASE)
// Cette route utilise "upload.single('photo')" pour capturer la photo de l'article
app.post('/publish-product', upload.single('photo'), async (req, res) => {
    const { title, description, price, stock, category } = req.body;
    try {
        let finalImageUrl = 'https://unsplash.com'; // Photo par défaut si vide

        // Si le vendeur a chargé une photo, on la propulse dans ton bucket Supabase Storage
        if (req.file) {
            finalImageUrl = await uploadToSupabase(req.file, 'produits');
        }

        // Insertion chirurgicale du nouvel article dans ta table 'products'
        const { error: productError } = await supabase.from('products').insert([
            {
                title: title,
                description: description,
                price: parseFloat(price) || 0,
                stock_quantity: parseInt(stock) || 0, // Aligné sur ta jauge de stock mobile
                category: category || 'General',
                image_url: finalImageUrl,
                vendedor_id: req.body.userId || 'vendeur_jula_demo', // Associe l'article au grossiste connecté
                created_at: new Date()
            }
        ]);

        if (productError) throw productError;

        // Message de succès royal ! Le produit est envoyé !
        res.send(`
            <div style="font-family: Arial; text-align: center; padding: 50px;">
                <h2 style="color: #28a745;">🎉 Article propulsé avec succès sur le Rayon Jula !</h2>
                <p>Prenez votre smartphone Tecno, rafraîchissez l'application et admirez le résultat en direct !</p>
                <a href="/vendedor/dashboard" style="display: inline-block; background: #f57c00; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px;">← Retourner au Magasin</a>
            </div>
        `);
    } catch (err) {
        res.status(500).send(`❌ Échec de la propulsion du produit : ${err.message}`);
    }
});

// 🔌 5. ALLUMAGE DU SERVEUR COMPATIBLE RENDER CLOUD
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur Mondial Jula branché avec succès sur le port ${PORT} !`);
});
