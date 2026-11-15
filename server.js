 require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const ws = require('ws'); 
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔒 CODE SECRET ADMINISTRATEUR JACKY
const ADMIN_SECRET_CODE = process.env.ADMIN_PASSWORD || 'Plam123';

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 📸 CONFIGURATION MULTI-PHOTOS (Mémoire tampon sécurisée à 5 Mo)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// 📡 INITIALISATION UNIVERSELLE DE SUPABASE
const urlSupabase = process.env.SUPABASE_URL;
const cleAnonPublic = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const cleSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY || cleAnonPublic;

const supabase = createClient(urlSupabase, cleSupabase, { 
    auth: { 
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }, 
    realtime: { transport: ws } 
});

// 🛡️ BARRIÈRE DE SÉCURITÉ ADMIN : Écran de connexion verrouillé
app.get('/jacky-superadmin-control', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Accès Sécurisé - QG Jula</title>
            <style>
                body { background: #111417; color: #fff; font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .box { background: #1a1d21; padding: 30px; border-radius: 12px; border: 1px solid #2d3139; border-top: 4px solid #f57c00; width: 90%; max-width: 360px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                h2 { margin-top: 0; color: #f57c00; font-size: 20px; }
                p { color: #adb5bd; font-size: 13px; margin-bottom: 20px; }
                input { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #2d3139; background: #111417; color: #fff; font-size: 15px; box-sizing: border-box; margin-bottom: 15px; text-align: center; }
                button { width: 100%; padding: 12px; background: #f57c00; color: #fff; border: none; border-radius: 6px; font-weight: bold; font-size: 15px; cursor: pointer; }
                button:hover { background: #e65100; }
                a { display: inline-block; margin-top: 15px; color: #7f8c8d; font-size: 12px; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="box">
                <h2>🔒 QG SuperAdmin Jula</h2>
                <p>Zone strictement réservée à la direction. Entrez votre code d'accès :</p>
                <form method="POST" action="/jacky-superadmin-control">
                    <input type="password" name="admin_code" placeholder="Mot de passe administrateur" required autofocus />
                    <button type="submit">Déverrouiller la Console</button>
                </form>
                <a href="/">← Retourner à l'accueil public</a>
            </div>
        </body>
        </html>
    `);
});

// 🔑 VÉRIFICATION DU MOT DE PASSE POUR OUVRIR LE QG ADMIN
app.post('/jacky-superadmin-control', async (req, res) => {
    const { admin_code } = req.body;
    if (admin_code !== ADMIN_SECRET_CODE) {
        return res.status(403).send(`
            <div style="background:#111417;color:#ff5252;font-family:Arial;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">
                <h2>❌ Accès Refusé : Mot de passe incorrect</h2>
                <a href="/jacky-superadmin-control" style="color:#f57c00;margin-top:10px;">Réessayer</a>
            </div>
        `);
    }

    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.render('admin-control', { profiles: profiles || [], adminCode: admin_code });
    } catch (err) {
        res.status(500).send(`❌ Erreur d'accès au QG Jacky : ${err.message}`);
    }
});

// 🌍 Routes d'affichage des formulaires graphiques de l'écosystème Jula
app.get('/', (req, res) => { res.render('index'); });
app.get('/register-seller', (req, res) => { res.render('register-seller'); });
app.get('/register-driver', (req, res) => { res.render('register-driver'); });
app.get('/register-station', (req, res) => { res.render('register-station'); });
app.get('/login', (req, res) => { res.render('login'); });

// 👥 ROUTE DE L'ÉQUIPE
app.get('/register-jula-team', (req, res) => { 
    res.render('register-team'); 
});

// 🔒 ROUTE POLITIQUE DE CONFIDENTIALITÉ JULA
app.get('/politique-confidentialite', (req, res) => { res.render('politique-confidentialite'); });

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
// 💾 1. MOTEUR D'INSCRIPTION INTERCONNECTÉ (MULTI-PHOTOS)
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
                    created_at: new Date().toISOString()
                }
            ]);
            if (profileError) throw profileError;
            
            if (business_type === 'boutique') return res.render('dashboard', { email, userId: authData.user.id });
            if (business_type === 'livreur') return res.render('dashboard-driver', { email, userId: authData.user.id, user: { id: authData.user.id, email } });
            if (business_type === 'relais') return res.render('dashboard-station', { email, userId: authData.user.id, user: { id: authData.user.id, email } });
            
            return res.send("❌ Rôle inconnu.");
        }
    } catch (err) { res.send(`❌ Erreur d'inscription sécurisée : ${err.message}`); }
});

// 🔐 2. CONNEXION UNIVERSELLE PARTENAIRES SÉCURISÉE ET DYNAMIQUE
app.post('/login-partner', async (req, res) => {
    const { email } = req.body;
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !profile) {
            return res.send(`❌ Aucun compte trouvé avec l'adresse ${email}. Créez-le d'abord via les formulaires du site !`);
        }

        const userRole = profile.role ? profile.role.toLowerCase().trim() : '';
        const profileId = profile.id;

        if (!profileId) {
            return res.redirect('/vendedor/dashboard');
        }

        // A. Si c'est un Vendeur / Grossiste
        if (userRole === 'boutique' || userRole === 'vendedor') {
            return res.redirect(`/vendedor/dashboard-orders/${profileId}`);
        }
        
        // B. Si c'est un Livreur / Coursier Réel
        if (userRole === 'livreur' || userRole === 'driver') {
            const { data: activeOrders } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'En attente de préparation');

            return res.render('dashboard-driver', { 
                email: profile.email, 
                userId: profileId,
                user: { id: profileId, email: profile.email },
                orders: activeOrders || [] 
            });
        }
        
        // C. Si c'est un Point Relais Hub Réel
        if (userRole === 'relais' || userRole === 'station') {
            const { data: stationOrders } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'En attente de préparation');

            return res.render('dashboard-station', { 
                email: profile.email, 
                userId: profileId,
                user: { id: profileId, email: profile.email },
                orders: stationOrders || [] 
            });
        }

        // D. L'aiguillage pour l'assistant support
        if (userRole === 'support' || userRole === 'assistance') {
            const { data: issueOrders } = await supabase.from('orders').select('*').not('status', 'eq', 'Livré');
            return res.render('dashboard-support', { 
                email: profile.email, 
                userId: profileId,
                user: { id: profileId, email: profile.email },
                orders: issueOrders || []
            });
        }

        return res.send("❌ Rôle de compte non reconnu.");
    } catch (err) {
        res.status(500).send(`❌ Erreur de connexion : ${err.message}`);
    }
});

// 🚀 5. MOTEUR DE PUBLICATION ET PROMOTION DE SMARTPHONES
app.post('/publish-product', upload.any(), async (req, res) => {
    try {
        const { title, description, price, promo_price, stock, category, userId } = req.body;
        let finalImageUrl = 'https://unsplash.com'; 

        if (req.files && req.files.length > 0) {
            try {
                const targetFile = req.files[0];
                const uploadedUrl = await uploadToSupabase(targetFile, 'produits');
                if (uploadedUrl) finalImageUrl = uploadedUrl;
            } catch (storageErr) {
                console.error("Problème d'upload d'image :", storageErr.message);
            }
        }

        const { error: productError } = await supabase.from('products').insert([
            {
                title: title || 'Nouvel Article Jula',
                description: description || '',
                price: parseFloat(price) || 0,
                promo_price: promo_price ? parseFloat(promo_price) : null,
                stock_quantity: parseInt(stock) || 1, 
                category: category || 'General',
                image_url: finalImageUrl,
                vendedor_id: userId,
                created_at: new Date().toISOString()
            }
        ]);

        if (productError) throw productError;

        return res.status(200).json({ 
            success: true, 
            message: "Action validée avec succès sur le Rayon Jula !",
            redirect_url: `/vendedor/dashboard-orders/${userId || ''}`
        });

    } catch (err) {
        return res.status(200).json({ success: false, error: err.message });
    }
});

// 🗑️ 5B. INTERFACE DE SUPPRESSION DE STOCK
app.post('/delete-product/:id', async (req, res) => {
    const { id } = req.params;
    const { vendedor_id } = req.body; 
    try {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        if (!vendedor_id) return res.redirect('/vendedor/dashboard');
        return res.redirect(`/vendedor/dashboard-orders/${vendedor_id}`);
    } catch (err) {
        res.status(500).send(`❌ Impossible de supprimer l'article : ${err.message}`);
    }
});

// 💳 6. CONFIGURATION OFFICIELLE DU PASSAGE EN CAISSE ZONES CFA
app.post('/create-order', async (req, res) => {
    const { vendedor_id, product_id, product_title, price, quantity, delivery_mode, buyer_email, buyer_address, buyer_phone } = req.body;
    try {
        let fraisLivraison = 1500;
        if (delivery_mode === 'Express' || delivery_mode === '⚡ Express') fraisLivraison = 2500;

        const totalFacture = (parseFloat(price) * parseInt(quantity || 1)) + fraisLivraison;

        await supabase.from('orders').insert([{
            vendedor_id, product_id, product_title, product_quantity: parseInt(quantity || 1),
            total_price: totalFacture, price_fcfa: parseFloat(price), delivery_fee: fraisLivraison,
            selected_delivery_mode: delivery_mode || 'Standard', status: 'En attente de préparation',
            buyer_email, buyer_address, buyer_phone, created_at: new Date().toISOString()
        }]);

        return res.status(200).json({ 
            success: true, 
            redirect_url: `/vendedor/dashboard-orders/${vendedor_id || ''}` 
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 🪐 3. ACTIONS DU QG JACKY
app.post('/verify-partner', async (req, res) => {
    const { id } = req.body;
    try {
        const { error } = await supabase.from('profiles').update({ is_verified: true }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true, message: "Partenaire activé !" });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post('/reject-partner', async (req, res) => {
    const { id } = req.body;
    try {
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true, message: "Profil nettoyé !" });
    } catch (err) { return res.status(500).json({ error: err.message }); }
});

// 🔌 ALLUMAGE CLOUD RENDER
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Serveur Mondial Jula branché avec succès sur le port ${PORT} !`); 
});
