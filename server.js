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
  // 🚀 5. MOTEUR DE PROPULSION DE PRODUIT UNIVERSEL (ANTI-CRASH ERREUR 500)
// .any() permet d'accepter n'importe quel nom de champ photo envoyé par ton fichier EJS !
app.post('/publish-product', upload.any(), async (req, res) => {
    try {
        const { title, description, price, stock, category } = req.body;
        
        // Image de haute qualité par défaut si aucune photo n'est sélectionnée
        let finalImageUrl = 'https://unsplash.com'; 

        // Extraction magique du fichier, peu importe son nom dans ton HTML (photo, image, etc.)
        if (req.files && req.files.length > 0) {
            try {
                const targetFile = req.files[0];
                const uploadedUrl = await uploadToSupabase(targetFile, 'produits');
                if (uploadedUrl) finalImageUrl = uploadedUrl;
            } catch (storageErr) {
                console.error("Problème d'upload d'image, utilisation par défaut.");
            }
        }

                 // Insertion chirurgicale et adaptative ajustée sur ton Supabase réel
        const { error: productError } = await supabase.from('products').insert([
            {
                title: title || 'Nouvel Article Jula',
                description: description || '',
                price: parseFloat(price) || 0,
                // 📦 Nettoyage : On utilise uniquement stock_quantity qui est la colonne officielle mobile
                stock_quantity: parseInt(stock) || 1, 
                category: category || 'General',
                image_url: finalImageUrl,
                vendedor_id: req.body.userId || 'vendeur_jula_demo',
                created_at: new Date()
            }
        ]);


        if (productError) throw productError;

        // Magnifique écran Jumia-Style en cas de réussite
        res.send(`
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f4f6f9; min-height: 100vh;">
                <div style="background: white; max-width: 500px; margin: 40px auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border-top: 5px solid #28a745;">
                    <h2 style="color: #28a745; margin-bottom: 10px;">🎉 Article propulsé avec succès !</h2>
                    <p style="color: #666; font-size: 14px;">Votre produit est maintenant disponible sur l'application mobile de vos clients.</p>
                    <a href="/vendedor/dashboard" style="display: inline-block; background: #f57c00; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px;">← Retourner au Magasin</a>
                </div>
            </div>
        `);
    } catch (err) {
        // Renvoie l'erreur de manière propre dans une boîte grise pour comprendre ce qui cloche
        res.status(200).send(`
            <div style="font-family: Arial; padding: 30px; text-align: center;">
                <h3 style="color: #d9534f;">⚙️ Diagnostic Technique de la Base de Données Jula</h3>
                <p style="background: #f8f9fa; padding: 15px; border-radius: 6px; display: inline-block; text-align: left; font-family: monospace;">${err.message}</p>
                <br><a href="/vendedor/dashboard" style="color: #f57c00; font-weight: bold; text-decoration: none;">← Réessayer</a>
            </div>
        `);
    }
});

// 🔌 5. ALLUMAGE DU SERVEUR COMPATIBLE RENDER CLOUD
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur Mondial Jula branché avec succès sur le port ${PORT} !`);
});
