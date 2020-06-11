const deezer = require('./deezer');
const spotify = require('./spotify');
const utils = require('../../utils');
const moment = require('moment');
const DiscogsCollection = require('mongoose').model('DiscogsCollection');

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

const fs = require('fs');
var util = require('util');
async function dispatchCompatibilityDiscogs(releases, spotify_token) {
  try {
    let searchCollection = await DiscogsCollection.find({ 'discogs.album.id': releases });

    await utils.asyncForEach(searchCollection, async (discogsItem) => {

      // Create the filename for the logs
      let filename = discogsItem.discogs.album.name.replace(new RegExp('[ /.]', 'g'), '') + '.txt'
      fs.writeFileSync(__dirname+"/res/"+filename, util.inspect(discogsItem.discogs), 'utf-8')

      // Generic function to check the results
      let checkResults = async function(from, results) {
        let winner, weHaveAWinner = false, bestScore = 75;
        for (let i = 0; i < results.length; i++) {
          let toCompare = results[i]; 
          let score = compareAlbums(discogsItem.discogs, toCompare, results.length);
          if(score > 40) {

          }
          if (score >= bestScore) {
            weHaveAWinner = true;
            bestScore = score;
            winner = toCompare;
          }
        }
        if (weHaveAWinner && winner) {
          await saveCollection(discogsItem.discogs.album.id, from, winner, bestScore);
        }
        return weHaveAWinner;
      }

      let discogsArtistName = utils.removeParentheses(discogsItem.discogs.album.artists[0].name);
      let discogsAlbumName = discogsItem.discogs.album.name;

      // Deezer bloc
      if (!discogsItem.deezer) {
        let matched = false, deezerResult;
        if (!matched) {
          deezerResult = await deezer.getSearch(discogsArtistName + ' ' + discogsAlbumName, 'album');
          if (deezerResult && deezerResult.albums) {
            deezerResult = deezerResult.albums;
            matched = await checkResults('deezer', deezerResult);
          }
        }
        if (!matched) {
          let i=0;
          do {
            let firstArtistTrack = discogsItem.discogs.tracks[i].artists[0];
            if (firstArtistTrack) firstArtistTrack = utils.removeParentheses(firstArtistTrack.name);
            deezerResult = await deezer.getSearch((firstArtistTrack ? firstArtistTrack : discogsArtistName) + ' ' + discogsItem.discogs.tracks[i].name, 'album');
            if (deezerResult && deezerResult.albums) {
              deezerResult = deezerResult.albums;
              matched = await checkResults('deezer', deezerResult);
            }
            i+=1;
          } while(!matched && i < discogsItem.discogs.tracks.length && i < 8) // thanks to Wikipedia, average number of tracks per album
        }
        if (!matched) {
          deezerResult = await deezer.getSearch('artist:"' + discogsArtistName + '"', 'album');
          if(deezerResult && deezerResult.albums) {
            deezerResult = deezerResult.albums;
            matched = await checkResults('deezer', deezerResult);
          }
        }
        if (!matched) {
          deezerResult = await deezer.getSearch(discogsAlbumName, 'album');
          if (deezerResult && deezerResult.albums) {
            deezerResult = deezerResult.albums;
            matched = await checkResults('deezer', deezerResult);
          }
        }
        if (!matched) {
          deezerResult = await deezer.getSearch(discogsAlbumName);
          if (deezerResult && deezerResult.albums) {
            deezerResult = deezerResult.albums;
            matched = await checkResults('deezer', deezerResult);
          }
        }
      }

      // Spotify bloc
      if (!discogsItem.spotify) {
        let matched = false, spotifyResult;
        if (!matched) {
          spotifyResult = await spotify.getSearch(spotify_token, discogsArtistName + ' ' + discogsAlbumName, 'album');
          if (spotifyResult && spotifyResult.albums) {
            spotifyResult = spotifyResult.albums;
            matched = await checkResults('spotify', spotifyResult);
          }
        }
        if (!matched) {
          let i=0;
          do {
            let firstArtistTrack = discogsItem.discogs.tracks[i].artists[0];
            if (firstArtistTrack) firstArtistTrack = utils.removeParentheses(firstArtistTrack.name);
            spotifyResult = await spotify.getSearch(spotify_token, (firstArtistTrack ? firstArtistTrack : discogsArtistName) + ' ' + discogsItem.discogs.tracks[i].name, 'album');
            if (spotifyResult && spotifyResult.albums) {
              spotifyResult = spotifyResult.albums;
              matched = await checkResults('spotify', spotifyResult);
            }
            i+=1;
          } while(!matched && i < discogsItem.discogs.tracks.length && i < 8) // thanks to Wikipedia, average number of tracks per album
        }
        if (!matched) {
          spotifyResult = await spotify.getSearch(spotify_token, 'artist:"' + discogsArtistName + '"', 'album');
          if(spotifyResult && spotifyResult.albums) {
            spotifyResult = spotifyResult.albums;
            matched = await checkResults('spotify', spotifyResult);
          }
        }
        if (!matched) {
          spotifyResult = await spotify.getSearch(spotify_token, discogsAlbumName, 'album');
          if (spotifyResult && spotifyResult.albums) {
            spotifyResult = spotifyResult.albums;
            matched = await checkResults('spotify', spotifyResult);
          }
        }
        if (!matched) {
          spotifyResult = await spotify.getSearch(spotify_token, discogsAlbumName);
          if (spotifyResult && spotifyResult.albums) {
            spotifyResult = spotifyResult.albums;
            matched = await checkResults('spotify', spotifyResult);
          }
        }
      }
    })
  } catch (err) {
    console.error(err);
  }
  console.log('dispatchCompatibilityDiscogs done')
}

function compareAlbums(discogs, compare, nbAlbumsToCompare) {
  var score = 33/nbAlbumsToCompare;

  let filename = discogs.album.name.replace(new RegExp('[ /.]', 'g'), '') + '.txt'
  fs.appendFileSync(__dirname+"/res/"+filename, "compare=\n")
  fs.appendFileSync(__dirname+"/res/"+filename, util.inspect(compare) , 'utf-8')

  if (utils.isSameUPC(discogs.album.upc, compare.upc)) { // check the upc
    score+=100;
  }
  fs.appendFileSync(__dirname+"/res/"+filename, "UPC = " + score +"\n" , 'utf-8')

  if (discogs.album.name.toUpperCase() === compare.name.toUpperCase()) { // checke the name of the album => 50%
    score+=40;
  } else {
    const regex = new RegExp('[^a-zA-Z0-9 ]', 'g');
    const discogsWords = discogs.album.name.replace(regex, '').toUpperCase().split(' ');
    const discogsNbWords = discogsWords.length;
    var discogsNbSameWords = 0;

    const compareWords = compare.name.replace(regex, '').toUpperCase().split(' ');
    const compareNbWords = compareWords.length;
    var compareNbSameWords = 0;

    for (let i = 0; i < discogsWords.length; i++) {
      for (let j = 0; j < compareWords.length; j++) {
        if ( discogsWords[i].includes(compareWords[j]) ) compareNbSameWords++;
        if ( compareWords[j].includes(discogsWords[i]) ) discogsNbSameWords++;
      }
    }

    if (discogsNbSameWords + compareNbSameWords === 0) {
      score-=40;
    } else {
      const deltaDiscogs = Math.abs(discogsNbWords - discogsNbSameWords);
      const deltaCompare = Math.abs(compareNbWords - compareNbSameWords);
      score+= (discogsNbWords-deltaDiscogs)/discogsNbWords * 15; // check the number of same word in the album name => 25%
      score+= (compareNbWords-deltaCompare)/compareNbWords * 15; // check the number of same word in the album name => 25%
    }
  }

  fs.appendFileSync(__dirname+"/res/"+filename, "same name = " + score +"\n" , 'utf-8')

  if (discogs.album.release_date === compare.updated_at) {
    score+= 20;
  }
  else if (discogs.album.release_date && compare.updated_at) { // check the release date => 40%
    const maxMonth = 24;
    const diffMonth = Math.abs(moment(discogs.album.release_date).diff(moment(compare.updated_at), 'months'));
    if (diffMonth < maxMonth) {
      score+= (maxMonth-diffMonth)/maxMonth * 15;
    } else {
      score -= 10;
    }
  }

  fs.appendFileSync(__dirname+"/res/"+filename, "release data = " + score +"\n" , 'utf-8')

  if (discogs.album.nb_tracks && compare.nb_tracks) { // check the number of tracks => 30%
    const deltaDiscogs = Math.abs(discogs.album.nb_tracks - compare.nb_tracks); // diff
    const deltaCompare = Math.abs(compare.nb_tracks - discogs.album.nb_tracks); // diff
    score+= (discogs.album.nb_tracks-deltaDiscogs)/discogs.album.nb_tracks * 15;
    score+= (compare.nb_tracks-deltaCompare)/compare.nb_tracks * 15;
  }

  fs.appendFileSync(__dirname+"/res/"+filename, "nb tracks = " + score +"\n" , 'utf-8')

  if (discogs.album.artists && discogs.album.artists.length > 0 && compare.artists && compare.artists.length > 0) {
    const discogsArtists = discogs.album.artists.map(a => utils.removeParentheses(a.name.toUpperCase()));
    const compareArtists = compare.artists.map(a => utils.removeParentheses(a.name.toUpperCase()));
    var discogsNbSameArtist = 0;
    var compareNbSameArtist = 0;

    for (let i = 0; i < discogsArtists.length; i++) {
      for (let j = 0; j < compareArtists.length; j++) {
        if ( discogsArtists[i].includes(compareArtists[j]) ) compareNbSameArtist++;
        if ( compareArtists[j].includes(discogsArtists[i]) ) discogsNbSameArtist++;
      }
    }

    if (discogsNbSameArtist + compareNbSameArtist === 0) {
      if ( compare.artists.map(a=>a.name) == 'Various Artists' 
        || discogs.album.artists.map(a=>a.name) == 'Various Artists') {
        score+=20;
      } else {
        score-=30;
      }
    } else {
      const discogsDelta = Math.abs(discogsArtists.length - discogsNbSameArtist);
      const compareDelta = Math.abs(compareArtists.length - compareNbSameArtist);
      score+= (discogsArtists.length-discogsDelta)/discogsArtists.length * 20; // check the number of same word in the artist name => 20%      
      score+= (compareArtists.length-compareDelta)/compareArtists.length * 20; // check the number of same word in the artist name => 20%      
    }
  } else {
    score -= 30;
  }

  fs.appendFileSync(__dirname+"/res/"+filename, "same artists (final score) = " + score +"\n" , 'utf-8')

  return score;
}

function saveCollection(id, platformKey, item, score) {
  const query = { 'discogs.album.id' : id };
  const options = { new: true, upsert: true, useFindAndModify: false };
  const update = {
    [platformKey]: {
      validity_score: score,
      validity_percent: Number.parseFloat(Math.min(score, 100)).toFixed(2),
      album: {
        id: item.id,
        name: item.name,
        release_date: item.updated_at,
        link: item.link,
        upc: item.upc,
        nb_tracks: item.nb_tracks,
        artists: !item.artists ? [] : item.artists.map(artist => {
          return {
            id: artist.id,
            name: artist.name,
            link: artist.link,
          }
        })
      },
      tracks: !item.tracks ? [] : item.tracks.map(track => {
        return {
          id: track.id,
          name: track.name,
          isrc: track.isrc,
          duration: track.duration,
          link: track.link,
          artists: track.artists,                    
        }
      })
    }
  };
  return DiscogsCollection.findOneAndUpdate(query, { $set: update }, options);
}

exports.crossAlbumUPC = crossAlbumUPC;
exports.crossTrackISRC = crossTrackISRC;
exports.crossSearch = crossSearch;
exports.dispatchCompatibilityDiscogs = dispatchCompatibilityDiscogs;