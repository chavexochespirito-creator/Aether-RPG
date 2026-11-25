const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const app = express();

const mongoURI = 'mongodb+srv://admin_samp:samp123@cluster0.2wi9tep.mongodb.net/samp_db?retryWrites=true&w=majority';

mongoose.connect(mongoURI);

const User = mongoose.model('User', { 
    username: { type: String, unique: true }, 
    password: { type: String }, 
    email: { type: String, unique: true },
    cash: { type: Number, default: 0 }
});

const Order = mongoose.model('Order', { 
    username: String, 
    amount: Number, 
    status: { type: String, default: 'Pendente' },
    date: { type: Date, default: Date.now }
});

const RecoveryRequest = mongoose.model('RecoveryRequest', {
    username: String,
    email: String,
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'Pendente' }
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'samp-ultra-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoURI })
}));

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

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.render('index', { error: 'E-mail não cadastrado!' });
    await RecoveryRequest.create({ username: user.username, email: email });
    res.render('index', { error: 'Pedido enviado! O ADM entrará em contato via Discord.' });
});

app.get('/shop', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = await User.findOne({ username: req.session.user });
    res.render('shop', { user });
});

app.post('/buy', async (req, res) => {
    await Order.create({ username: req.session.user, amount: req.body.amount });
    res.redirect('/shop');
});

app.get('/admin', async (req, res) => {
    const query = req.query.search || '';
    const orders = await Order.find({ status: 'Pendente' });
    const users = await User.find({ username: new RegExp(query, 'i') });
    const recoveries = await RecoveryRequest.find({ status: 'Pendente' });
    const revenueData = await Order.aggregate([{ $match: { status: 'Aprovado' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const totalRevenue = revenueData[0]?.total || 0;
    res.render('admin', { orders, users, recoveries, totalRevenue, query });
});

app.post('/approve', async (req, res) => {
    const order = await Order.findById(req.body.id);
    if (order) {
        await User.findOneAndUpdate({ username: order.username }, { $inc: { cash: order.amount } });
        order.status = 'Aprovado';
        await order.save();
    }
    res.redirect('/admin');
});

app.post('/admin/reset-pass', async (req, res) => {
    const { requestId, newPassword } = req.body;
    const request = await RecoveryRequest.findById(requestId);
    if (request) {
        const hashedPass = await bcrypt.hash(newPassword, 10);
        await User.findOneAndUpdate({ username: request.username }, { password: hashedPass });
        request.status = 'Resolvido';
        await request.save();
    }
    res.redirect('/admin');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.listen(process.env.PORT || 3000);
