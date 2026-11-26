const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

const mongoURI = 'mongodb+srv://admin_samp:samp123@cluster0.2wi9tep.mongodb.net/samp_db?retryWrites=true&w=majority';

app.use(helmet({ contentSecurityPolicy: false })); 
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

mongoose.connect(mongoURI).then(() => console.log("Aether RPG Marketplace Online!"));

const User = mongoose.model('User', { 
    username: { type: String, unique: true, required: true }, 
    password: { type: String, required: true }, 
    email: { type: String, unique: true, required: true },
    cash: { type: Number, default: 0 }
});

const Item = mongoose.model('Item', {
    id: String, name: String, price: Number, category: String, image: String, description: String
});

const Category = mongoose.model('Category', { name: String, description: String });

const Coupon = mongoose.model('Coupon', {
    code: { type: String, unique: true },
    discount: Number,
    type: { type: String, default: 'percent' },
    maxUses: Number,
    expiry: Date
});

const Order = mongoose.model('Order', { 
    username: String, 
    items: Array,
    total: Number,
    status: { type: String, default: 'Pendente' },
    date: { type: Date, default: Date.now }
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'aether-elite-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoURI })
}));

app.get('/', (req, res) => res.render('loading'));
app.get('/auth', (req, res) => res.render('index', { error: null }));
app.get('/home', (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    res.render('home');
});

app.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        const hashedPass = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPass, email });
        res.render('index', { error: 'Conta criada! Faça login.' });
    } catch (e) { res.render('index', { error: 'Erro: Usuário ou E-mail já existem.' }); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = user.username;
        res.redirect('/home');
    } else { res.render('index', { error: 'Usuário ou senha incorretos!' }); }
});

app.get('/shop', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth');
    const items = await Item.find();
    const categories = await Category.find();
    res.render('shop', { user: req.session.user, items, categories });
});

app.post('/add-to-cart', (req, res) => {
    if (!req.session.cart) req.session.cart = [];
    const { itemId } = req.body;
    req.session.cart.push(itemId);
    res.redirect('/shop');
});

app.get('/checkout', async (req, res) => {
    if (!req.session.user) return res.//redirect('/auth');
    const cartIds = req.session.cart || [];
    const items = await Item.find({ id: { $in: cartIds } });
    const total = items.reduce((sum, item) => sum + item.price, 0);
    res.render('checkout', { items, total });
});

app.post('/finalize-payment', async (req, res) => {
    const username = req.session.user;
    const items = req.session.cart || [];
    const total = items.reduce((sum, item) => sum + item.price, 0); // Simplificado
    await Order.create({ username, items, total, status: 'Aprovado' });
    req.session.cart = [];
    res.render('success');
});

app.get('/admin', async (req, res) => {
    const orders = await Order.find().sort({ date: -1 });
    const users = await User.find();
    const items = await Item.find();
    const categories = await Category.find();
    const coupons = await Coupon.find();
    const revenue = await Order.aggregate([{ $match: { status: 'Aprovado' } }, { $group: { _id: null, total: { $sum: '$total' } } }]);
    res.render('admin', { orders, users, items, categories, coupons, totalRevenue: revenue[0]?.total || 0 });
});

app.post('/admin/add-item', async (req, res) => {
    await Item.create(req.body);
    res.redirect('/admin');
});
app.post('/admin/add-category', async (req, res) => {
    await Category.create(req.body);
    res.redirect('/admin');
});
app.post('/admin/add-coupon', async (req, res) => {
    await Coupon.create(req.body);
    res.redirect('/admin');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/auth'); });
app.listen(process.env.PORT || 3000);
