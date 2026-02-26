const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 10086;
const db = new sqlite3.Database(':memory:');

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Database
db.serialize(() => {
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT)");
  db.run("CREATE TABLE dishes (id INTEGER PRIMARY KEY, name TEXT, price REAL, stock INTEGER)");
  db.run("CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, dish_id INTEGER, status TEXT)");

  db.run("INSERT INTO users (username, password, role) VALUES ('admin', 'admin', 'admin')");
  db.run("INSERT INTO dishes (name, price, stock) VALUES ('Red Braised Pork', 15.0, 50), ('Kung Pao Chicken', 12.0, 30), ('Tomato Egg', 8.0, 100)");
});

// Middleware: Auth check
const auth = (req, res, next) => {
  if (req.cookies.user === 'admin') next();
  else res.redirect('/login');
};

app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin') {
    res.cookie('user', 'admin');
    res.redirect('/admin');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.get('/admin', auth, (req, res) => {
  db.all("SELECT * FROM dishes", [], (err, dishes) => {
    db.all("SELECT orders.id, dishes.name, orders.status FROM orders JOIN dishes ON orders.dish_id = dishes.id", [], (err, orders) => {
      res.render('admin', { dishes, orders });
    });
  });
});

app.post('/add-dish', auth, (req, res) => {
  const { name, price, stock } = req.body;
  db.run("INSERT INTO dishes (name, price, stock) VALUES (?, ?, ?)", [name, price, stock], () => res.redirect('/admin'));
});

app.get('/logout', (req, res) => {
  res.clearCookie('user');
  res.redirect('/login');
});

app.listen(port, () => console.log(`Smart Canteen System running at http://localhost:${port}`));
