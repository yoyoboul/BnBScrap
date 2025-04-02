// scraper.js
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const { cleanObject, flattenArraysInObject, pickBySchema } = require('./util');

const USER_AGENT = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)";
const BASE_URL = "https://www.airbnb.com";
let robotsTxtContent = "";
const IGNORE_ROBOTS_TXT = false; // Vous pouvez le configurer dynamiquement

const robotsErrorMessage = "This path is disallowed by Airbnb's robots.txt to this User-agent. You may or may not want to run the server with '--ignore-robots-txt' args";

async function fetchRobotsTxt() {
  if (IGNORE_ROBOTS_TXT) return;
  try {
    const response = await fetchWithUserAgent(`${BASE_URL}/robots.txt`);
    robotsTxtContent = await response.text();
  } catch (error) {
    console.error("Error fetching robots.txt:", error);
    robotsTxtContent = "";
  }
}

function isPathAllowed(path) {
  if (!robotsTxtContent) return true;
  const robots = robotsParser(BASE_URL + path, robotsTxtContent);
  if (!robots.isAllowed(path, USER_AGENT)) {
    console.error(robotsErrorMessage);
    return false;
  }
  return true;
}

async function fetchWithUserAgent(url) {
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

async function handleAirbnbSearch(params) {
  const {
    location,
    placeId,
    checkin,
    checkout,
    adults = 1,
    children = 0,
    infants = 0,
    pets = 0,
    minPrice,
    maxPrice,
    cursor,
    ignoreRobotsText = false,
  } = params;

  const searchUrl = new URL(`${BASE_URL}/s/${encodeURIComponent(location)}/homes`);
  if (placeId) searchUrl.searchParams.append("place_id", placeId);
  if (checkin) searchUrl.searchParams.append("checkin", checkin);
  if (checkout) searchUrl.searchParams.append("checkout", checkout);

  const adults_int = parseInt(adults.toString());
  const children_int = parseInt(children.toString());
  const infants_int = parseInt(infants.toString());
  const pets_int = parseInt(pets.toString());
  const totalGuests = adults_int + children_int;
  if (totalGuests > 0) {
    searchUrl.searchParams.append("adults", adults_int.toString());
    searchUrl.searchParams.append("children", children_int.toString());
    searchUrl.searchParams.append("infants", infants_int.toString());
    searchUrl.searchParams.append("pets", pets_int.toString());
  }
  if (minPrice) searchUrl.searchParams.append("price_min", minPrice.toString());
  if (maxPrice) searchUrl.searchParams.append("price_max", maxPrice.toString());
  if (cursor) searchUrl.searchParams.append("cursor", cursor);

  const path = searchUrl.pathname + searchUrl.search;
  if (!ignoreRobotsText && !isPathAllowed(path)) {
    return { content: [{ type: "text", text: JSON.stringify({ error: robotsErrorMessage, url: searchUrl.toString() }, null, 2) }], isError: true };
  }

  const allowSearchResultSchema = {
    listing: { id: true, name: true, title: true, coordinate: true, structuredContent: { mapCategoryInfo: { body: true }, mapSecondaryLine: { body: true }, primaryLine: { body: true }, secondaryLine: { body: true } } },
    avgRatingA11yLabel: true,
    listingParamOverrides: true,
    structuredDisplayPrice: { primaryLine: { accessibilityLabel: true }, secondaryLine: { accessibilityLabel: true }, explanationData: { title: true, priceDetails: { items: { description: true, priceString: true } } } },
  };

  try {
    const response = await fetchWithUserAgent(searchUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);
    let staysSearchResults = {};
    try {
      const scriptElement = $("#data-deferred-state-0").first();
      const clientData = JSON.parse($(scriptElement).text()).niobeMinimalClientData[0][1];
      const results = clientData.data.presentation.staysSearch.results;
      cleanObject(results);
      staysSearchResults = {
        searchResults: results.searchResults
          .map((result) => flattenArraysInObject(pickBySchema(result, allowSearchResultSchema)))
          .map((result) => { return { url: `${BASE_URL}/rooms/${result.listing.id}`, ...result }; }),
        paginationInfo: results.paginationInfo
      };
    } catch (e) {
      console.error(e);
    }
    return { content: [{ type: "text", text: JSON.stringify({ searchUrl: searchUrl.toString(), ...staysSearchResults }, null, 2) }], isError: false };
  } catch (error) {
    return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error), searchUrl: searchUrl.toString() }, null, 2) }], isError: true };
  }
}

async function handleAirbnbListingDetails(params) {
  const { id, checkin, checkout, adults = 1, children = 0, infants = 0, pets = 0, ignoreRobotsText = false } = params;
  const listingUrl = new URL(`${BASE_URL}/rooms/${id}`);
  if (checkin) listingUrl.searchParams.append("check_in", checkin);
  if (checkout) listingUrl.searchParams.append("check_out", checkout);

  const adults_int = parseInt(adults.toString());
  const children_int = parseInt(children.toString());
  const infants_int = parseInt(infants.toString());
  const pets_int = parseInt(pets.toString());
  const totalGuests = adults_int + children_int;
  if (totalGuests > 0) {
    listingUrl.searchParams.append("adults", adults_int.toString());
    listingUrl.searchParams.append("children", children_int.toString());
    listingUrl.searchParams.append("infants", infants_int.toString());
    listingUrl.searchParams.append("pets", pets_int.toString());
  }

  const path = listingUrl.pathname + listingUrl.search;
  if (!ignoreRobotsText && !isPathAllowed(path)) {
    return { content: [{ type: "text", text: JSON.stringify({ error: robotsErrorMessage, url: listingUrl.toString() }, null, 2) }], isError: true };
  }

  const allowSectionSchema = {
    "LOCATION_DEFAULT": { lat: true, lng: true, subtitle: true, title: true },
    "POLICIES_DEFAULT": { title: true, houseRulesSections: { title: true, items: { title: true } } },
    "HIGHLIGHTS_DEFAULT": { highlights: { title: true } },
    "DESCRIPTION_DEFAULT": { htmlDescription: { htmlText: true } },
    "AMENITIES_DEFAULT": { title: true, seeAllAmenitiesGroups: { title: true, amenities: { title: true } } },
  };

  try {
    const response = await fetchWithUserAgent(listingUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);
    let details = {};
    try {
      const scriptElement = $("#data-deferred-state-0").first();
      const clientData = JSON.parse($(scriptElement).text()).niobeMinimalClientData[0][1];
      const sections = clientData.data.presentation.stayProductDetailPage.sections.sections;
      sections.forEach((section) => cleanObject(section));
      details = sections
        .filter((section) => allowSectionSchema.hasOwnProperty(section.sectionId))
        .map((section) => {
          return {
            id: section.sectionId,
            ...flattenArraysInObject(pickBySchema(section.section, allowSectionSchema[section.sectionId]))
          };
        });
    } catch (e) {
      console.error(e);
    }
    return { content: [{ type: "text", text: JSON.stringify({ listingUrl: listingUrl.toString(), details: details }, null, 2) }], isError: false };
  } catch (error) {
    return { content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error), listingUrl: listingUrl.toString() }, null, 2) }], isError: true };
  }
}

module.exports = { handleAirbnbSearch, handleAirbnbListingDetails, fetchRobotsTxt, USER_AGENT, BASE_URL };
