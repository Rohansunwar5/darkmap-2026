import axios from 'axios';

const fetchNames = async () => {
    try {
        const response = await axios.get('https://api.ransomware.live/groups', {
            headers: {
                accept: 'application/json',
            },
        });

        const data = response.data;

        // Extract all unique names from the response
        const names = new Set();

        data.forEach((group) => {
            if (group.name) {
                names.add(group.name);
            }
        });

        console.log('Extracted Names:', Array.from(names));
    } catch (error) {
        console.error('Error fetching data:', error.message);
    }
};

fetchNames();
