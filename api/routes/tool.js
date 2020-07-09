const express = require('express');
const router = express.Router();
const tool = require('../src/tool');
const utils = require('../../utils');


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
    const spotify_token = req.spotify_token;

    tool.crossAlbumUPC(spotify_token, from, query, upc).then(data => {
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
    const spotify_token = req.spotify_token;

    tool.crossTrackISRC(spotify_token, from, query, isrc).then(data => {
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
    const types = req.query.t || '*';
    const user = req.user;
    const spotify_token = req.spotify_token;

    tool.crossSearch(spotify_token, query, types).then(data => {
      res.status(200).json({
        'data': data,
      })
    }).catch(err => next(err));
  }
});

module.exports = router;
