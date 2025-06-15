const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Lưu ID người dùng vào session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Lấy thông tin người dùng từ ID trong session
passport.deserializeUser((id, done) => {
    User.findById(id).then(user => {
        done(null, user);
    });
});

// =================== LOGIC MỚI CHO ĐĂNG NHẬP LOCAL ===================
passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
    // 1. Tìm người dùng trong DB bằng email
    User.findOne({ email: email })
        .then(user => {
            if (!user) {
                // Nếu không tìm thấy user, trả về lỗi
                return done(null, false, { message: 'Email này chưa được đăng ký.' });
            }
            if (!user.password) {
                // Nếu user này đăng ký qua Google và không có mật khẩu
                return done(null, false, { message: 'Tài khoản này được đăng ký bằng Google. Vui lòng đăng nhập bằng Google.' });
            }

            // 2. Nếu có user, so sánh mật khẩu
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) throw err;
                if (isMatch) {
                    // Mật khẩu khớp, trả về user
                    return done(null, user);
                } else {
                    // Mật khẩu không khớp
                    return done(null, false, { message: 'Mật khẩu không chính xác.' });
                }
            });
        })
        .catch(err => console.log(err));
}));


// =================== LOGIC CŨ CHO ĐĂNG NHẬP GOOGLE (GIỮ NGUYÊN) ===================
passport.use(
    new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback'
    }, (accessToken, refreshToken, profile, done) => {
        User.findOne({ googleId: profile.id }).then(currentUser => {
            if (currentUser) {
                done(null, currentUser);
            } else {
                // Tạo user mới nếu chưa tồn tại
                new User({
                    googleId: profile.id,
                    email: profile.emails[0].value
                }).save().then(newUser => {
                    done(null, newUser);
                });
            }
        });
    })
);
