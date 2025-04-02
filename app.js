// app.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

// On suppose que vous avez extrait vos fonctions de scraping dans scraper.js
const { handleAirbnbSearch, handleAirbnbListingDetails, fetchRobotsTxt } = require('./scraper');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Route pour traiter la recherche
app.post('/search', async (req, res) => {
  const filters = req.body;

  try {
    // Assurer que le robots.txt est bien chargé
    await fetchRobotsTxt();

    // Appel de la fonction de recherche
    const searchResult = await handleAirbnbSearch(filters);
    const resultJson = JSON.parse(searchResult.content[0].text);

    // Pour simplifier, nous limitons la récupération à 5 annonces
    const listings = resultJson.searchResults.slice(0, 5);

    // Pour chaque annonce, récupérer les détails
    const detailsPromises = listings.map(async (listing) => {
      const idMatch = listing.url.match(/\/rooms\/(\d+)/);
      if (idMatch) {
        const id = idMatch[1];
        const detailResult = await handleAirbnbListingDetails({
          id,
          checkin: filters.checkin,
          checkout: filters.checkout,
          adults: filters.adults,
          children: filters.children,
          infants: filters.infants,
          pets: filters.pets,
          ignoreRobotsText: filters.ignoreRobotsText || false,
        });
        const detailJson = JSON.parse(detailResult.content[0].text);
        return { listing, details: detailJson.details };
      } else {
        return { listing, details: null };
      }
    });

    const detailedListings = await Promise.all(detailsPromises);

    // Construire une réponse HTML simple avec les résultats
    let html = `<h1>Résultats pour "${filters.location}"</h1>`;
    detailedListings.forEach((item, index) => {
      html += `<div class="result">
                  <h2>Annonce ${index + 1}</h2>
                  <p><strong>URL :</strong> <a href="${item.listing.url}" target="_blank">${item.listing.url}</a></p>
                  <pre>${JSON.stringify(item.details, null, 2)}</pre>
               </div>`;
    });
    res.send(html);
  } catch (error) {
    res.status(500).send(`Erreur lors de la recherche : ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Application démarrée sur http://localhost:${port}`);
});
