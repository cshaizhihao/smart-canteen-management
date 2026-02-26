const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 10086;
const dbFile = path.join(__dirname, 'canteen.db');

// Ensure DB initialization
const db = new sqlite3.Database(dbFile);

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Database Schema
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT, balance REAL DEFAULT 100.0)");
  db.run("CREATE TABLE IF NOT EXISTS dishes (id INTEGER PRIMARY KEY, name TEXT, price REAL, stock INTEGER, category TEXT, description TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER, dish_id INTEGER, status TEXT DEFAULT 'Pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

  // Default Admin
  db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin', 'admin')");
  
  // Initial Menu
  db.get("SELECT count(*) as count FROM dishes", (err, row) => {
    if (row.count === 0) {
      db.run("INSERT INTO dishes (name, price, stock, category, description) VALUES ('红烧肉', 18.0, 50, '主菜', '经典本帮味道，肥而不腻')");
      db.run("INSERT INTO dishes (name, price, stock, category, description) VALUES ('宫保鸡丁', 15.0, 30, '主菜', '酸甜适口，鸡肉滑嫩')");
      db.run("INSERT INTO dishes (name, price, stock, category, description) VALUES ('番茄炒蛋', 10.0, 100, '家常菜', '国民级下饭菜')");
      db.run("INSERT INTO dishes (name, price, stock, category, description) VALUES ('手撕包菜', 8.0, 40, '素菜', '爆炒出镬气，爽脆入味')");
    }
  });
});

// Auth Middlewares
const requireLogin = (req, res, next) => {
  if (req.cookies.username) next();
  else res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
  if (req.cookies.role === 'admin') next();
  else res.status(403).send('无权访问管理界面');
};

// Routes
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
    if (user) {
      res.cookie('username', user.username);
      res.cookie('role', user.role);
      res.cookie('user_id', user.id);
      res.redirect('/dashboard');
    } else {
      res.render('login', { error: '用户名或密码错误' });
    }
  });
});

app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, 'student')", [username, password], (err) => {
    if (err) res.render('register', { error: '用户名已存在' });
    else res.redirect('/login');
  });
});

app.get('/dashboard', requireLogin, (req, res) => {
  const role = req.cookies.role;
  if (role === 'admin') {
    db.all("SELECT * FROM dishes", (err, dishes) => {
        db.all("SELECT orders.*, users.username, dishes.name as dish_name FROM orders JOIN users ON orders.user_id = users.id JOIN dishes ON orders.dish_id = dishes.id ORDER BY created_at DESC", (err, orders) => {
            res.render('admin-dash', { dishes, orders, user: req.cookies.username });
        });
    });
  } else {
    db.all("SELECT * FROM dishes WHERE stock > 0", (err, dishes) => {
      db.get("SELECT balance FROM users WHERE username = ?", [req.cookies.username], (err, user) => {
        db.all("SELECT orders.*, dishes.name as dish_name FROM orders JOIN dishes ON orders.dish_id = dishes.id WHERE user_id = ? ORDER BY created_at DESC", [req.cookies.user_id], (err, orders) => {
            res.render('student-dash', { dishes, balance: user.balance, orders, user: req.cookies.username });
        });
      });
    });
  }
});

// API Routes
app.post('/order/:id', requireLogin, (req, res) => {
    const dishId = req.params.id;
    const userId = req.cookies.user_id;

    db.get("SELECT price, stock FROM dishes WHERE id = ?", [dishId], (err, dish) => {
        if (!dish || dish.stock <= 0) return res.status(400).send("库存不足");
        
        db.get("SELECT balance FROM users WHERE id = ?", [userId], (err, user) => {
            if (user.balance < dish.price) return res.status(400).send("余额不足");

            db.serialize(() => {
                db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [dish.price, userId]);
                db.run("UPDATE dishes SET stock = stock - 1 WHERE id = ?", [dishId]);
                db.run("INSERT INTO orders (user_id, dish_id, status) VALUES (?, ?, '已下单')", [userId, dishId]);
                res.redirect('/dashboard');
            });
        });
    });
});

app.post('/admin/update-status/:id', requireAdmin, (req, res) => {
    const orderId = req.params.id;
    const newStatus = req.body.status;
    db.run("UPDATE orders SET status = ? WHERE id = ?", [newStatus, orderId], () => res.redirect('/dashboard'));
});

app.get('/logout', (req, res) => {
  res.clearCookie('username');
  res.clearCookie('role');
  res.clearCookie('user_id');
  res.redirect('/login');
});

app.listen(port, () => console.log(`Smart Canteen System expanded at http://localhost:${port}`));
