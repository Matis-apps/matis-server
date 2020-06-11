const express = require('express');
const router = express.Router();
const discogs = require('../src/discogs');
const utils = require('../../utils');

router.get('/me/folders', (req, res, next) => {
  discogs.getFolders(req.discogs_token, req.discogs_secret, req.discogs_name).then(data => {
    res.status(200).json(data)
  }).catch(err => next(err));
});

router.get('/me/folder/:id([0-9]+)', (req, res, next) => {
  const id = req.params.id;
  discogs.getFolderItems(req.discogs_token, req.discogs_secret, req.discogs_name, id).then(data => {
    res.status(200).json({data, 'genres': data.genres})
  }).catch(err => next(err));
});

router.post('/transfer/collection', require('../middleware/globalSpotify'), (req, res, next) => {
  const releases = req.body.releases;
  if (!releases) {
    next(utils.error("Missing q parameter", 400));
  } else {
    const spotify_token = req.spotify_token;
    discogs.getReleasesDetails(req.discogs_token, req.discogs_secret, releases, spotify_token).then(data => {
      res.status(200).json(data)
    }).catch(err => next(err));
  }  
});

module.exports = router;