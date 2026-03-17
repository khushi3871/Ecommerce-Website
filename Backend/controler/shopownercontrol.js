const Users = require('../modules/shopownerModel');
const Products = require('../modules/productModel');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary');
const nodemailer = require('nodemailer');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET
});

const shopownercontrol = {
    register: async (req, res) => {
        console.log("register");
        try {
            const { name, lastname, phone, email, password, shopname, shopadd, zip } = req.body;
            const user = await Users.findOne({ email });
            if (user) return res.status(400).json({ msg: "THIS EMAIL IS ALREADY EXIST" });
            if (password.length < 6) return res.status(400).json({ msg: "THIS PASSWORD IS TOO WEAK" });

            const passwordhash = await bcrypt.hash(password, 10);
            const newuser = new Users({
                name, lastname, phone, email, password: passwordhash, shopname, shopadd, zip
            });

            await newuser.save();
            const accesstoken = createAccessToken({ id: newuser._id });
            const refreshtoken = createRefreshToken({ id: newuser._id });

            res.cookie('refreshtoken', refreshtoken, {
                httpOnly: true,
                path: '/user/refresh_token',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            res.json({ accesstoken });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    login: async (req, res) => {
        console.log("login");
        try {
            const { email, password } = req.body;
            const user = await Users.findOne({ email });
            if (!user) return res.status(400).json({ msg: "THIS User don't EXISTS" });

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ msg: "Incorrect Password" });

            const accesstoken = createAccessToken({ id: user._id });
            const refreshtoken = createRefreshToken({ id: user._id });

            res.cookie('refreshtoken', refreshtoken, {
                httpOnly: true,
                path: '/user/refresh_token',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            res.json({ accesstoken });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    add: async (req, res) => {
        console.log("add product data");
        try {
            const { name, about, prize, url, N } = req.body;
            const shopowner = await Users.findById(req.user.id);
            const newproduct = new Products({ name, about, prize, "email": shopowner.email, url, N });
            await newproduct.save();
            res.json({ newproduct });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    photo: async (req, res) => {
        console.log("photo adding to cloudinary");
        try {
            if (!req.files || Object.keys(req.files).length === 0)
                return res.status(400).json({ msg: 'No files were uploaded.' });

            const file = req.files.file;

            if (file.size > 1024 * 1024) {
                removeTmp(file.tempFilePath);
                return res.status(400).json({ msg: "Size too large (Max 1MB)" });
            }

            // Using Promise to properly catch Cloudinary errors
            const result = await new Promise((resolve, reject) => {
                cloudinary.v2.uploader.upload(file.tempFilePath, { folder: "test" }, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            removeTmp(file.tempFilePath);
            res.json({ public_id: result.public_id, url: result.secure_url });

        } catch (err) {
            console.error("Cloudinary Error:", err);
            return res.status(500).json({ msg: "Cloudinary upload failed: " + err.message });
        }
    },

    destroy: async (req, res) => {
        try {
            console.log("photo remove");
            const { public_id } = req.body;
            if (!public_id) return res.status(400).json({ msg: 'No images Selected' });

            await cloudinary.v2.uploader.destroy(public_id);
            res.json({ msg: "Deleted Image" });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    redata: async (req, res) => {
        console.log("update shopowner data");
        try {
            const { name, lastname, phone, age, gst, bank, ifsc, add1, add2, add3 } = req.body;
            const shopowner = await Users.findByIdAndUpdate(req.user.id, {
                name, lastname, phone, age, gst, ifsc, bank, add1, add2, add3
            }, { new: true });

            res.json({ shopowner });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    all: async (req, res) => {
        try {
            const shopowner = await Users.findById(req.user.id);
            const products = await Products.find({ "email": shopowner.email });
            res.json({ "list": products });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    refreshtoken: async (req, res) => {
        try {
            const rf_token = req.cookies.refreshtoken;
            if (!rf_token) return res.status(400).json({ message: "Please Login or Register" });

            jwt.verify(rf_token, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
                if (err) return res.status(400).json({ message: "PLEASE LOGIN OR REGISTER" });
                const accesstoken = createAccessToken({ id: user.id });
                res.json({ accesstoken });
            });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    info: async (req, res) => {
        try {
            const user = await Users.findById(req.user.id);
            res.json({ "user": user });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    done: async (req, res) => {
        try {
            const { val } = req.body;
            const user = await Users.findById(req.user.id);
            let orders = user.order.filter(item => 
                !((item.name === val.name) && (item.order === val.order) && (item.date === val.date))
            );
            await Users.findByIdAndUpdate(user._id, { "order": orders });
            res.json({ "user": user });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    },

    notdone: async (req, res) => {
        try {
            const { val } = req.body;
            const user = await Users.findById(req.user.id);
            let orders = user.order.filter(item => 
                !((item.name === val.name) && (item.order === val.order) && (item.date === val.date))
            );
            await Users.findByIdAndUpdate(user._id, { "order": orders });

            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.Email,
                    pass: process.env.Password
                },
                port: 465,
                host: 'smtp.gmail.com'
            });

            let mailOptions = {
                from: process.env.Email,
                to: val.email,
                subject: "Your Pooja Order has been Cancelled",
                html: `<h1 style="text-align: center; background-color:red;">Order Cancelled</h1>
                       <div style="display: flex; align-items: center; border: 1px solid red; padding: 10px;">
                           <img src="${val.poojaurl}" width="150" height="150" />
                           <div style="margin-left: 20px;">
                               <h2>Name: ${val.order}</h2>
                               <h3>Price: ₹${val.poojaprize}.00</h3>
                           </div>
                       </div>`
            };

            await transporter.sendMail(mailOptions);
            res.json({ "user": user });
        } catch (err) {
            return res.status(500).json({ msg: err.message });
        }
    }
};

const createRefreshToken = (user) => jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
const createAccessToken = (user) => jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });

const removeTmp = (path) => {
    fs.unlink(path, err => { if (err) console.error(err); });
};

module.exports = shopownercontrol;