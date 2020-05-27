const express = require('express');
const router = express.Router();
const tool = require('../src/tool');
const utils = require('../../utils');

// middleware allowing to call middlware only if needed
router.use((req, res, next) => {
  const from = req.query.from || null;
  if ((typeof from === 'string' && from != 'spotify') || (from == null)) {
    try {
      require('../middleware/isSpotify').isSpotify(req, res, next); // needed to refresh the token
      return;
    } catch(err) {
      next(err);
    }
  } else {
    next()
  }
});

router.get('/upc', (req, res, next) => {
  if (!req.query.q) {
    next(utils.error("Missing q parameter", 400));
  } else if (!req.query.upc) {
    next(utils.error("Missing upc parameter", 400));
  } else if (!req.user) {
    next(utils.error("No user provided", 400));
  } else {
    const from = req.query.from || '*';
    const query = req.query.q;
    const upc = req.query.upc;
    const user = req.user;

    tool.crossAlbumUPC(user, from, query, upc).then(data => {
      res.status(200).json({
        'data': data,
      })
    }).catch(err => next(err));
  }
});

router.get('/isrc', (req, res, next) => {
  if (!req.query.q) {
    next(utils.error("Missing q parameter", 400));
  } else if (!req.query.isrc) {
    next(utils.error("Missing isrc parameter", 400));
  } else if (!req.user) {
    next(utils.error("No user provided", 400));
  } else {
    const from = req.query.from || '*';
    const query = req.query.q;
    const isrc = req.query.isrc;
    const user = req.user;

    tool.crossTrackISRC(user, from, query, isrc).then(data => {
      res.status(200).json({
        'data': data,
      })
    }).catch(err => next(err));
  }
});


router.get('/search', (req, res, next) => {
  if (!req.query.q) {
    next(utils.error("Missing q parameter", 400));
  } else if (!req.user) {
    next(utils.error("No user provided", 400));
  } else {
    const query = req.query.q;
    const user = req.user;

    tool.crossSearch(user, query).then(data => {
      res.status(200).json({
        'data': data,
      })
    }).catch(err => next(err));
  }
});

module.exports = router;
