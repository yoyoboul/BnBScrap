// main.js
document.getElementById('searchForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const filters = {};
  formData.forEach((value, key) => {
    filters[key] = value;
  });
  
  // Envoi des données du formulaire en JSON vers la route /search
  try {
    const response = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters)
    });
    if (response.ok) {
      const html = await response.text();
      document.getElementById('results').innerHTML = html;
    } else {
      document.getElementById('results').innerHTML = 'Erreur lors de la recherche.';
    }
  } catch (error) {
    document.getElementById('results').innerHTML = 'Erreur : ' + error.message;
  }
});
