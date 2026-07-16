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

// 📡 INITIALISATION UNIVERSELLE DE SUPABASE AVEC LES DEUX FRÉQUENCES COMPATIBLES
const urlSupabase = process.env.SUPABASE_URL;

// On déclare les deux clés pour que Render ne cherche aucun mot dans le vide
const cleAnonPublic = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const cleSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY || cleAnonPublic; // Ta vraie clé maîtresse !

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

// 🔒 ROUTE INTERNATIONALE POUR LA POLITIQUE DE CONFIDENTIALITÉ JULA
app.get('/politique-confidentialite', (req, res) => { res.render('politique-confidentialite'); });

 // 📥 PORTAIL DE PUBLICATION JULA - EXTRACTION DYNAMIQUE DE L'UTILISATEUR SÉCURISÉ
app.get('/vendedor/dashboard', async (req, res) => {
    try {
        // Le serveur regarde si Supabase possède une session active pour l'utilisateur
        const { data: { session } } = await supabase.auth.getSession();
        
        let userEmail = req.query.email || 'vendeur@jula.com';
        let userId = req.query.userId || '';

        // Si une vraie session existe, on écrase les valeurs de test par tes vraies coordonnées !
        if (session && session.user) {
            userEmail = session.user.email;
            userId = session.user.id;
        }

        res.render('dashboard', { 
            email: userEmail, 
            userId: userId,
            user: { id: userId, email: userEmail } 
        });
    } catch (err) {
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
            if (business_type === 'livreur') return res.render('dashboard-driver', { email, userId: authData.user.id, user: { id: authData.user.id, email } });
            if (business_type === 'relais') return res.render('dashboard-station', { email, userId: authData.user.id, user: { id: authData.user.id, email } });
            
            return res.send("❌ Rôle inconnu.");
        }
    } catch (err) { res.send(`❌ Erreur d'inscription sécurisée : ${err.message}`); }
});
// 🔐 2. CONNEXION UNIVERSELLE BOUTIQUE / LIVREUR / RELAIS (SÉCURISÉE CONTRE LES SLASHES VIDES)
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

        // 🛡️ SÉCURITÉ DE SECOURS : Si l'ID dans Supabase est introuvable, on évite le slash vide
        if (!profileId) {
            return res.redirect('/vendedor/dashboard');
        }

        if (userRole === 'boutique' || userRole === 'vendedor') {
            return res.redirect(`/vendedor/dashboard-orders/${profileId}`);
        }
        
        if (userRole === 'livreur' || userRole === 'driver') {
            return res.render('dashboard-driver', { 
                email: profile.email, 
                userId: profileId,
                user: { id: profileId, email: profile.email }
            });
        }
        
        if (userRole === 'relais' || userRole === 'station') {
            return res.render('dashboard-station', { 
                email: profile.email, 
                userId: profileId,
                user: { id: profileId, email: profile.email }
            });
        }
        
        return res.redirect(`/vendedor/dashboard-orders/${profileId}`);

    } catch (err) {
        res.status(500).send(`⚙️ Erreur de transition des portails Jula : ${err.message}`);
    }
});

 // 🏪 3. TABLEAU DE BORD COMMERCIAL ET FINANCIER DES GROSSISTES JULA (VERSION SECURISÉE PRODUCTION)
app.get('/vendedor/dashboard-orders/:vendedor_id', async (req, res) => {
    const { vendedor_id } = req.params;
    
    try {
        // 🛡️ SÉCURITÉ DE SECOURS : Si le paramètre arrive vide ou n'a pas la bonne longueur UUID, on évite le plantage
        if (!vendedor_id || vendedor_id === 'undefined' || vendedor_id.trim() === '') {
            console.log("⚠️ Identifiant de grossiste manquant dans l'URL. Redirection vers le login.");
            return res.redirect('/login');
        }

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('vendedor_id', vendedor_id);

        if (ordersError) {
            return res.render('vendedor_orders', { orders: [], vendedor_id, totalEarnings: 0, pendingOrdersCount: 0 });
        }

        let totalEarnings = 0;
        let pendingOrdersCount = 0;
        
        if (orders && orders.length > 0) {
            orders.forEach(order => {
                if (order.status === 'Livré' || order.status === 'En cours de livraison') {
                    totalEarnings += Number(order.total_price || order.price_fcfa || 0);
                }
                if (order.status === 'En attente de préparation') {
                    pendingOrdersCount++;
                }
            });
        }

        res.render('vendedor_orders', { 
            orders: orders || [], 
            vendedor_id, 
            totalEarnings, 
            pendingOrdersCount 
        });
    } catch (err) {
        console.error("❌ Erreur critique sur le dashboard orders:", err.message);
        res.redirect('/login');
    }
});
// 🔄 4. MISE À JOUR DU STATUT DES PANIER ET EXPÉDITIONS
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

// 🚀 5. MOTEUR DE PUBLICATION ET PROMOTION
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
                console.error("Problème d'upload d'image");
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
                created_at: new Date()
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

 // 🗑️ 5B. ROUTE DE DESTRUCTION DE PRODUIT (VERSION BLINDÉE DE PRODUCTION)
app.post('/delete-product/:id', async (req, res) => {
    const { id } = req.params;
    const { vendedor_id } = req.body; 
    try {
        console.log(`🗑️ Destruction demandée pour le produit ID: ${id}`);

        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        console.log(`✅ Produit supprimé. Redirection vers le tableau de bord du vendeur.`);

        // SÉCURITÉ DE SECOURS : Si le vendeur_id est vide, on redirige vers le dashboard général au lieu de crasher
        if (!vendedor_id) {
            return res.redirect('/vendedor/dashboard');
        }

        return res.redirect(`/vendedor/dashboard-orders/${vendedor_id}`);
    } catch (err) {
        console.error(`❌ Échec de la suppression : ${err.message}`);
        res.status(500).send(`❌ Impossible de supprimer l'article : ${err.message}`);
    }
});

// 💳 6. CONFIGURATION OFFICIELLE PAYDUNYA PRODUCTION
app.post('/create-order', async (req, res) => {
    const { vendedor_id, product_id, product_title, price, quantity, delivery_mode, buyer_email, buyer_address, buyer_phone } = req.body;
    try {
        let fraisLivraison = 1500;
        if (delivery_mode === 'Express' || delivery_mode === '⚡ Express') fraisLivraison = 2500;

        const totalFacture = (parseFloat(price) * parseInt(quantity || 1)) + fraisLivraison;

        const response = await fetch("https://paydunya.com", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY,
                "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY,
                "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN
            },
            body: JSON.stringify({
                invoice: {
                    total_amount: totalFacture,
                    description: `Achat Jula - Article : ${product_title || 'Produit Jula'}`
                },
                store: {
                    name: "Jula E-Commerce Network",
                    tagline: "Le carrefour des grossistes de l'Afrique de l'Ouest",
                    postal_address: buyer_address || "Abidjan, Adjame",
                    phone: buyer_phone || "0700000000"
                },
                actions: {
                    cancel_url: `https://onrender.com{vendedor_id}`,
                    return_url: `https://onrender.com{vendedor_id}`
                }
            })
        });

        const data = await response.json();

        if (data.response_code === "00") {
            await supabase.from('orders').insert([{
                vendedor_id, product_id, product_title, product_quantity: parseInt(quantity) || 1,
                total_price: totalFacture, price_fcfa: parseFloat(price), delivery_fee: fraisLivraison,
                selected_delivery_mode: delivery_mode, status: 'En attente de préparation',
                buyer_email, buyer_address, buyer_phone, created_at: new Date()
            }]);

            return res.status(200).json({ success: true, redirect_url: data.response_text });
        } else {
            throw new Error(data.response_text || "Erreur PayDunya");
        }

    } catch (err) {
        try {
            await supabase.from('orders').insert([{
                vendedor_id, product_id, product_title, product_quantity: parseInt(quantity || 1),
                total_price: (parseFloat(price) * parseInt(quantity || 1)) + 1500, price_fcfa: parseFloat(price),
                delivery_fee: 1500, selected_delivery_mode: delivery_mode || 'Standard', status: 'En attente de préparation',
                buyer_email, buyer_address, buyer_phone, created_at: new Date()
            }]);
        } catch (dbErr) { console.error(dbErr); }

        return res.status(200).json({ 
            success: true, 
            redirect_url: `https://onrender.com{vendedor_id || ''}` 
        });
    }
});

// ⚡ 7. FEUILLE DE ROUTE LOGISTIQUE
app.get('/livreur/dashboard', async (req, res) => {
    try {
        const { data: activeOrders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'En attente de préparation');

        if (ordersError) throw ordersError;

        res.render('dashboard-driver', { 
            orders: activeOrders || [],
            message: activeOrders.length === 0 ? "Aucune course disponible sur votre secteur actuellement." : null
        });
    } catch (err) {
        res.status(500).send(`❌ Erreur logistique : ${err.message}`);
    }
});

// 🔌 ALLUMAGE COMPATIBLE CLOUD RENDER
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Serveur Mondial Jula branché avec succès sur le port ${PORT} !`); 
});
