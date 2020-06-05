const deezer = require('./deezer');
const spotify = require('./spotify');
const utils = require('../../utils');

function crossAlbumUPC (spotify_token, fromPlateform, query, upc) {
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

function crossTrackISRC (spotify_token, fromPlateform, query, isrc) {
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


function crossSearch (spotify_token, query) {
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

    if (spotify_token) {
      const spotifyResult = await spotify.getSearch(spotify_token, query)
        .then(result => {
          plateforms.spotify = result;
          hasResults = true;
        })
        .catch(err => error = err);
    }

    if(hasResults) {
      resolve(unifySearch(plateforms))
    } else {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    }
  });
}

function unifySearch(result) {
  var results = new Object;
  results.albums = [];
  results.tracks = [];
  if (Object.keys(result).length > 1) {
    Object.keys(result).forEach(plateform1 => {
      var matchedAlbums = [];
      var matchedTracks = [];
      let albums1 = result[plateform1].albums;
      let tracks1 = result[plateform1].tracks;

      Object.keys(result).filter(item => item != plateform1).forEach(plateform2 => {
        // Match albums
        let albums2 = result[plateform2].albums;
        if (albums1 && albums2) {
          var [albums, remains] = matchAlbums(albums1, albums2);
          Array.prototype.push.apply(matchedAlbums, albums);
          result[plateform2].albums = remains;
        }
  
        // Match tracks
        let tracks2 = result[plateform2].tracks;
        if (tracks1 && tracks2) {
          var [tracks, remains] = matchTracks(tracks1, tracks2);
          Array.prototype.push.apply(matchedTracks, tracks);
          result[plateform2].tracks = remains;
        }
      })
      
      if (matchedAlbums.length > 0) {
        Array.prototype.push.apply(results.albums, matchedAlbums);
        if (result[plateform1].albums) result[plateform1].albums = [];
      }
      if (matchedTracks.length > 0) {
        Array.prototype.push.apply(results.tracks, matchedTracks);
        if (result[plateform1].tracks) result[plateform1].tracks = [];
      }

    })
  }

  // Add the other elements
  Object.keys(result).forEach(plateform => {
    if(result[plateform].albums) {
      result[plateform].albums.forEach(item => {
        results.albums.push([item])
      });
    }
  });

  results.albums.sort((a,b) => sortResults(a,b))

  Object.keys(result).forEach(plateform => {
    if(result[plateform].tracks) {
      result[plateform].tracks.forEach(item => {
        results.tracks.push([item])
      });
    }
  });

  results.tracks.sort((a,b) => sortResults(a,b))

  return results;
}

function sortResults ( a, b ) {
  if ( a[0] == null ) return -1;
  if ( b[0] == null ) return 1;

  if ( a[0].updated_at > b[0].updated_at ) {
    return -1;
  }
  if ( a[0].updated_at < b[0].updated_at ) {
    return 1;
  }
  return 0;
}

function matchAlbums(albums1, albums2) {
  var albums = matched = [];
  albums1.forEach(i1 => {
    matched = [];
    matched.push(i1);
    for(let i = 0; i < albums2.length; i++) {
      let i2 = albums2[i];
      if (utils.isSameUPC(i1.upc, i2.upc)) {
        matched.push(i2);
        break;
      } else if (i1.name === i2.name && i1.updated_at === i2.updated_at) {
        matched.push(i2);
        break;
      } else if (utils.removeParentheses(i1.name) == utils.removeParentheses(i2.name) && i1.artists.length == i2.artists.length) { // same name, then check the artists
        matched.push(i2);
        break;
          
        /* To be checked if this is really usefull
        const length = i1.artists.length;
        var countMatch = 0;
        for (j = 0; j < length; j++) {
          let artist1 = i1.artists[j].name.toUpperCase()
          for (k = 0; k < length; k++) {
            let artist2 = i2.artists[k].name.toUpperCase()
            if(artist1 == artist2) countMatch++;
          }
        }
        if (countMatch == length) {
          matched.push(i2);
          break;
        }
        */
      }
    }
    albums.push(matched);
    albums2 = albums2.filter(i => !matched.map(m => m.upc).includes(i.upc));
  })

  return [ albums, albums2 ];
}

function matchTracks(tracks1, tracks2) {
  var tracks = matched = [];
  tracks1.forEach(i1 => {
    matched = [];
    matched.push(i1);
    for(let i = 0; i < tracks2.length; i++) {
      let i2 = tracks2[i];
      if (i1.isrc == i2.isrc) {
        matched.push(i2);
        break;
      }
    }
    tracks.push(matched);
    tracks2 = tracks2.filter(i => !matched.map(m => m.isrc).includes(i.isrc));

  })

  return [ tracks, tracks2 ];
}



exports.crossAlbumUPC = crossAlbumUPC;
exports.crossTrackISRC = crossTrackISRC;
exports.crossSearch = crossSearch;