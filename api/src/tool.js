const deezer = require('./deezer');
const spotify = require('./spotify');
const utils = require('../../utils');

function crossAlbumUPC (user, fromPlateform, query, upc) {
  return new Promise(async (resolve, reject) => {
    var plateforms = new Object;
    var hasResults = false;
    var error = null;
    if(fromPlateform != 'deezer') {
      const deezerResult = await deezer.searchAlbumUPC(query, upc)
        .then(result => {
          plateforms.deezer = result;
          hasResults = true;
        })
        .catch(err => error = err);
    }

    if(fromPlateform != 'spotify') {
      var spotify_token = user.spotify.token.access_token;
      if (spotify_token) {
        const spotifyResult = await spotify.searchAlbumUPC(spotify_token, query, upc)
          .then(result => {
            plateforms.spotify = result;
            hasResults = true;
          })
          .catch(err => error = err);
      } else {
        error = utils.error("No access_token for Spotify", 401);
      }
    }

    if(hasResults) {
      resolve(plateforms)
    } else {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    }
  });
}

function crossTrackISRC (user, fromPlateform, query, isrc) {
  return new Promise(async (resolve, reject) => {
    var plateforms = new Object;
    var hasResults = false;
    var error = null;
    if(fromPlateform != 'deezer') {
      const deezerResult = await deezer.searchTrackISRC(query, isrc)
        .then(result => {
          plateforms.deezer = result;
          hasResults = true;
        })
        .catch(err => error = err);
    }

    if(fromPlateform != 'spotify') {
      var spotify_token = user.spotify.token.access_token;
      if (spotify_token) {
        const spotifyResult = await spotify.searchTrackISRC(spotify_token, query, isrc)
          .then(result => {
            plateforms.spotify = result;
            hasResults = true;
          })
          .catch(err => error = err);
      } else {
        error = utils.error("No access_token for Spotify", 401);
      }
    }

    if(hasResults) {
      resolve(plateforms)
    } else {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    }
  });
}


function crossSearch (user, query) {
  return new Promise(async (resolve, reject) => {
    var plateforms = new Object;
    var hasResults = false;
    var error = null;

    const deezerResult = await deezer.getSearch(query)
      .then(result => {
        plateforms.deezer = result;
        hasResults = true;
      })
      .catch(err => error = err);
    console.log('error')
    console.log(error)
    var spotify_token = user.spotify.token.access_token;
    if (spotify_token) {
      const spotifyResult = await spotify.getSearch(spotify_token, query)
        .then(result => {
          plateforms.spotify = result;
          hasResults = true;
        })
        .catch(err => error = err);
    } else {
      error = utils.error("No access_token for Spotify", 401);
    }

    if(hasResults) {
      resolve(plateforms)
    } else {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    }
  });
}


exports.crossAlbumUPC = crossAlbumUPC;
exports.crossTrackISRC = crossTrackISRC;
exports.crossSearch = crossSearch;