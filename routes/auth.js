const router = require('express').Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Route: Xử lý đăng ký tài khoản mới
router.post('/register', async (req, res) => {
    const { email, password, confirmPassword } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!email || !password || !confirmPassword) {
        return res.status(400).send('Vui lòng điền đầy đủ các trường.');
    }
    if (password !== confirmPassword) {
        return res.status(400).send('Mật khẩu không khớp.');
    }
    if (password.length < 6) {
        return res.status(400).send('Mật khẩu phải có ít nhất 6 ký tự.');
    }

    try {
        // Kiểm tra xem email đã tồn tại trong database chưa
        const existingUser = await User.findOne({ email: email });
        if (existingUser) {
            return res.status(400).send('Email đã được sử dụng.');
        }

        // Mã hóa mật khẩu trước khi lưu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Tạo một người dùng mới
        const newUser = new User({
            email: email,
            password: hashedPassword
        });

        // Lưu người dùng vào database
        await newUser.save();
        
        // Sau khi đăng ký thành công, chuyển hướng người dùng đến trang đăng nhập
        res.redirect('/login/');

    } catch (err) {
        console.error(err);
        res.status(500).send('Đã có lỗi xảy ra phía server.');
    }
});

// Route: Xử lý đăng nhập bằng Email và Mật khẩu
router.post('/login/password', (req, res, next) => {
    // Sử dụng hàm callback tùy chỉnh của Passport để kiểm soát hoàn toàn quá trình
    passport.authenticate('local', (err, user, info) => {
        // Nếu có lỗi hệ thống, chuyển cho middleware xử lý lỗi
        if (err) { 
            return next(err); 
        }
        // Nếu xác thực thất bại (sai email hoặc mật khẩu)
        if (!user) {
            // Lấy thông báo lỗi từ Passport (ví dụ: "Mật khẩu không chính xác.")
            // Mã hóa thông báo để gửi qua URL một cách an toàn
            const errorMessage = encodeURIComponent(info.message);
            // Chuyển hướng người dùng trở lại trang đăng nhập với thông báo lỗi
            return res.redirect(`/login/?error=${errorMessage}`);
        }
        // Nếu xác thực thành công, đăng nhập người dùng vào session
        req.logIn(user, (err) => {
            if (err) { 
                return next(err); 
            }
            // Chuyển hướng đến trang cửa hàng sau khi đăng nhập thành công
            return res.redirect('/shop/');
        });
    })(req, res, next);
});

// Route: Bắt đầu quá trình đăng nhập với Google
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'] // Yêu cầu lấy thông tin profile và email từ Google
}));

// Route: Callback URL mà Google sẽ chuyển hướng về sau khi người dùng xác thực
router.get('/google/callback', passport.authenticate('google', {
    successRedirect: '/shop/', // Nếu thành công, chuyển hướng đến trang shop
    failureRedirect: '/login/'  // Nếu thất bại, quay về trang đăng nhập
}));

// Route: Đăng xuất người dùng
router.get('/logout', (req, res, next) => {
    // Phương thức logout() được Passport thêm vào request object
    req.logout(function(err) {
        if (err) { return next(err); }
        // Sau khi đăng xuất, chuyển hướng người dùng về trang shop
        res.redirect('/shop/');
      });
});

module.exports = router;
