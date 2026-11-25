const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const app = express();

const mongoURI = 'mongodb+srv://admin_samp:samp123@cluster0.2wi9tep.mongodb.net/';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log("Banco de Dados Conectado!"))
.catch(err => console.log("Erro ao conectar: ", err));

const User = mongoose.model('User', { 
    username: { type: String, unique: true }, 
    password: { type: String }, 
    cash: { type: Number, default: 0 } 
});

const Order = mongoose.model('Order', { 
    username: String, 
    amount: Number, 
    status: { type: String, default: 'Pendente' } 
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'samp-secret-key', resave: false, saveUninitialized: true }));

app.get('/', (req, res) => res.render('index'));

app.post('/register', async (req, res) => {
    try {
        const hashedPass = await bcrypt.hash(req.body.password, 10);
        await User.create({ username: req.body.username, password: hashedPass });
        res.send("Conta criada com sucesso! <a href='/'>Voltar para Login</a>");
    } catch (e) { res.send("Erro: Usuário já existe."); }
});

app.post('/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.user = user.username;
        res.redirect('/shop');
    } else { res.send("Usuário ou senha incorretos!"); }
});

app.get('/shop', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = await User.findOne({ username: req.session.user });
    res.render('shop', { user });
});

app.post('/buy', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    await Order.create({ username: req.session.user, amount: req.body.amount });
    res.send("Pedido enviado! O ADM irá conferir o Pix e liberar seu cash. <a href='/shop'>Voltar para Loja</a>");
});

app.get('/admin', async (req, res) => {
    const orders = await Order.find({ status: 'Pendente' });
    res.render('admin', { orders });
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

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
