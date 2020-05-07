const https = require('https')

let user_id = 16192550

/**
 * getArtists Return the first 100 artists loved by a user
 * @params user_id
 * @params index
 * @params retry
 */
var getArtists = async function(user_id) {

  const artistsLimit = 10; // Limit of items to retrieve
  const artists = [];
  
  /**
   * fetchArtists return the artists grouped due to pagination. The function can be used recursively.
   * @params integer index offset for the pagination
   * @params integer retry count the number of retries allowed after an error
   */
  const fetchArtists = async function(index = 0, retry = 10) {

    // Configuration of the HTTPS request
    const options = {
      hostname: 'api.deezer.com',
      port: 443,
      path: '/user/'+user_id+'/artists?limit='+artistsLimit+'&index='+index,
      method: 'GET'
    };

    return new Promise((resolve, reject) => {
      var req = https.request(options, response => {
        if (response.statusCode === 200) {

          // Event when receive the data
          var responseBody = "";
          response.on('data', function(chunck) { responseBody = chunck });

          // Event when the request is ending
          response.on('end', () => {
            var json = JSON.parse(responseBody)
            if (json.code == 429) {
              if (retry >0) {
                setTimout(fetchArtists, index, retry-1)
              }
            }

            Array.prototype.push.apply(artists, json.data) // Merge the new data in the table

            if (json.next) { // if there is a next, so other artists 
              resolve(fetchArtists(index + artistsLimit));
            } else { // otherwise, return the whole table
              resolve(artists)
            }
          })
        } else {
          if (retry > 0) {
            setTimeout(fetchArtists, index, retry-1)
          }
        }
      })

      req.end();
      req.on('error', function(e) {
        if (retry > 0) {
          setTimeout(fetchArtists, index, retry-1)
        }
      });
    })
  }
  return fetchArtists()
}

getArtists(user_id).then(data => {
  data.forEach(i => console.log(i.name))
})