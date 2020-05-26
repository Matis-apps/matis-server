const express = require('express');
const router = express.Router();
const spotify = require('../src/spotify');
const utils = require('../../utils');


router.get('/me/releases', (req, res, next) => {
  spotify.getMyReleases(req.spotify_token).then(data => {
    res.status(200).json({
      'data': data,
      'genres': data.genres,
      'count': data.length,
    })
  }).catch(err => next(err));
});


/*
router.get('/releases/:friend_id', (req, res, next) => {
  const friend_id = req.params.friend_id;
  spotify.getReleases(friend_id, req.deezer_token).then(data => {
    res.status(200).json({
      'data': data,
      'genres': data.genres,
      'count': data.length,
    })
  }).catch(err => next(err));
});
*/

router.get('/release/:obj([a-z]+)/:id([0-9a-zA-Z]+)', (req, res, next) => {
  const obj = req.params.obj;
  const id = req.params.id;
  console.log("ok")
  spotify.getReleaseContent(req.spotify_token, obj, id).then(data => {
    res.status(200).json({
      'data': data,
    })
  }).catch(err => next(err));
});


/*
router.get('/artist/:artist_id/related', (req, res, next) => {
  const id = req.params.artist_id;
  spotify.getRelatedArtists(id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});
*/

/*
router.get('/me/social', (req, res, next) => {
  spotify.getSocialFriends('me', req.deezer_token).then(data => {
    res.status(200).json({
      'data': data,
      'countFollowers': data.followers ? data.followers.length : 0,
      'countFollowings': data.followings ? data.followings.length : 0,
    })
  }).catch(err => next(err));
});
*/

router.get('/search', (req, res, next) => {
  if (!req.query.q) {
    next(utils.error("Missing q parameter", 400));
  } else {
    const query = req.query.q;
    const types = req.query.t || '*';
    const strict = req.query.s || true;

    spotify.getSearch(req.spotify_token, query, types, strict).then(data => {
      res.status(200).json({
        'data': data,
      })
    }).catch(err => next(err));
  }
});

module.exports = router;