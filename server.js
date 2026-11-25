const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const app = express();

const mongoURI = 'mongodb+srv://admin_samp:samp123@cluster0.2wi9tep.mongodb.net/samp_db?retryWrites=true&w=majority';
const DISCORD_WEBHOOK_URL = 'SEU_LINK_DO_WEBHOOK_DISCORD';

app.use(helmet());
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

mongoose.connect(mongoURI);

const User = mongoose.model('User', { 
    username: { type: String, unique: true }, 
    password: { type: String }, 
    email: { type: String, unique: true },
    cash: { type: Number, default: 0 },
    avatar: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' }
});

const Order = mongoose.model('Order', { 
    username: String, 
    amount: Number, 
    cashAmount: Number,
    status: { type: String, default: 'Pendente' },
    date: { type: Date, default: Date.now }
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'samp-ultra-secure-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoURI })
}));

async function sendDiscordNotification(message) {
    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: "💰 Nova Solicitação de Cash!",
                description: message,
                color: 16766720, // Amarelo
                timestamp: new Date()
            }]
        });
    } catch (e) { console.log("Erro Discord:", e); }
}

app.get('/', (req, res) => res.render('index', { error: null }));

app.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        const hashedPass = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPass, email });
        res.render('index', { error: 'Conta criada! Faça login.' });
    } catch (e) { res.render('index', { error: 'Erro: Usuário ou E-mail já existem.' }); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.user = user.username;
        res.redirect('/shop');
    } else { res.render('index', { error: 'Usuário ou senha incorretos!' }); }
});

app.get('/shop', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = await User.findOne({ username: req.session.user });
    res.render('shop', { user });
});

app.post('/create-payment', async (req, res) => {
    const { cashAmount } = req.body;
    const amount = cashAmount / 1000; // 1000 moedas = 1 Real
    const username = req.session.user;

    await Order.create({ username, amount, cashAmount, status: 'Pendente' });

    await sendDiscordNotification(`**Jogador:** ${username}\n**Quantidade:** ${cashAmount} Cash\n**Valor:** R$ ${amount.toFixed(2)}`);

    res.render('checkout', { cashAmount, amount });
});

app.get('/admin', async (req, res) => {
    const orders = await Order.find().sort({ date: -1 });
    const users = await User.find();
    const revenue = await Order.aggregate([{ $match: { status: 'Aprovado' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    res.render('admin', { orders, users, totalRevenue: revenue[0]?.total || 0 });
});

app.post('/approve', async (req, res) => {
    const order = await Order.findById(req.body.id);
    if (order) {
        await User.findOneAndUpdate({ username: order.username }, { $inc: { cash: order.cashAmount } });
        order.status = 'Aprovado';
        await order.save();
    }
    res.redirect('/admin');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(process.env.PORT || 3000);
