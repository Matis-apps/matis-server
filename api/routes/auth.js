const express = require('express');
const router = express.Router();
const auth = require('../src/auth');

router.post('/login', (req, res, next) => {
  auth.login(req).then(data => {
    res.status(200).json(data)
  }).catch(err => next(err));
});

router.post('/register', (req, res, next) => {
  auth.register(req).then(data => {
    res.status(200).json(data)
  }).catch(err => next(err));
});

router.post('/token', (req, res, next) => {
  auth.token(req).then(data => {
    res.status(200).json(data)
  }).catch(err => next(err));
});

module.exports = router;
