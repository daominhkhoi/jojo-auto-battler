// static/js/entities.js
import { IMAGES } from './assets.js';

export const CHAMPION_POOL = [
    // --- TƯỚNG 1 VÀNG ---
    {
        name: "Soft Machine", cost: 1, img: IMAGES["Soft Machine"],
        hp: 100000, attack: 1000, attack_range: 1, speed: 1, max_mana: 150,
        traits: ["Renegade", "Assassin"],
        skill: { type: 'stun', duration: 1 }
    },
    {
        name: "Kraft Work", cost: 1, img: IMAGES["Kraft Work"],
        hp: 80000, attack: 2000, attack_range: 1, speed: 1.2, max_mana: 150,
        traits: ["Renegade", "Brawler"],
        skill: { type: 'speed_buff', power: 25, duration: 10 }
    },
    {
        name: "Little Feet", cost: 1, img: IMAGES["Little Feet"],
        hp: 70000, attack: 1800, attack_range: 3, speed: 1.2, max_mana: 150,
        traits: ["La Squadra", "Assassin"],
        skill: { type: 'dot', power: 5000, duration: 4.0 }
    },
    {
        name: "Talking Head", cost: 1, img: IMAGES["Talking Head"],
        hp: 60000, attack: 1500, attack_range: 1, speed: 1.2, max_mana: 150,
        traits: ["Unita Speciale", "Support"],
        skill: { type: 'mana_lock', duration: 2.0 }
    },
    {
        name: "Rolling Stones", cost: 1, img: IMAGES["Rolling Stones"],
        hp: 120000, attack: 500, attack_range: 1, speed: 0.5, max_mana: 150,
        traits: ["Renegade", "Support"],
        skill: { type: 'damage', power: 30000, duration: 0 }
    },

    // --- TƯỚNG 2 VÀNG ---
    {
        name: "Sex Pistols", cost: 2, img: IMAGES["Sex Pistols"],
        hp: 60000, attack: 2000, attack_range: 5, speed: 1.5, max_mana: 150,
        traits: ["Team Bucciarati", "Sniper"],
        skill: { type: 'speed_buff', power: 50, duration: 10 }
    },
    {
        name: "Black Sabbath", cost: 2, img: IMAGES["Black Sabbath"],
        hp: 60000, attack: 2500, attack_range: 1.5, speed: 0.7, max_mana: 150,
        traits: ["Renegade", "Mage"],
        skill: { type: 'mana_lock', duration: 3.0 }
    },
    {
        name: "Baby Face", cost: 2, img: IMAGES["Baby Face"],
        hp: 60000, attack: 2200, attack_range: 2, speed: 0.5, max_mana: 150,
        traits: ["La Squadra", "Mage"],
        skill: { type: 'clone', percent: 0.3 }
    },
    {
        name: "Man in the Mirror", cost: 2, img: IMAGES["Man in the Mirror"],
        hp: 50000, attack: 2500, attack_range: 1.5, speed: 1.1, max_mana: 150,
        traits: ["La Squadra", "Mage"],
        skill: { type: 'swap', power: 30000 }
    },
    {
        name: "Beach Boy", cost: 2, img: IMAGES["Beach Boy"],
        hp: 60000, attack: 3500, attack_range: 4, speed: 1, max_mana: 150,
        traits: ["La Squadra", "Sniper"],
        skill: { type: 'stun', duration: 2 }
    },
    {
        name: "Mr. President", cost: 2, img: IMAGES["Mr. President"],
        hp: 60000, attack: 2000, attack_range: 1, speed: 0.8, max_mana: 150,
        traits: ["Artifact", "Support"],
        skill: { type: 'aoe_heal', radius: 1.5, power: 4000, duration: 10 }
    },

    // --- TƯỚNG 3 VÀNG ---
    {
        name: "Moody Blues", cost: 3, img: IMAGES["Moody Blues"],
        hp: 80000, attack: 3500, attack_range: 1, speed: 0.5, max_mana: 150,
        traits: ["Team Bucciarati", "Support"],
        skill: { type: 'clone', percent: 0.45 }
    },
    {
        name: "Silver Chariot", cost: 3, img: IMAGES["Silver Chariot"],
        hp: 70000, attack: 4500, attack_range: 1.2, speed: 1.2, max_mana: 150,
        traits: ["Team Bucciarati", "Brawler"],
        skill: { type: 'speed_buff', power: 75, duration: 10 }
    },
    {
        name: "Stand Arrow", cost: 3, img: IMAGES["Stand Arrow"],
        hp: 80000, attack: 1000, attack_range: 5, speed: 1, max_mana: 150,
        traits: ["Artifact", "Support"],
        skill: { type: 'aoe_heal', radius: 2.5, power: 5000, duration: 10 }
    },

    // --- TƯỚNG 4 VÀNG ---
    {
        name: "Sticky Fingers", cost: 4, img: IMAGES["Sticky Fingers"],
        hp: 70000, attack: 5500, attack_range: 1, speed: 1.5, max_mana: 150,
        traits: ["Team Bucciarati", "Brawler"],
        skill: { type: 'swap', power: 45000 }
    },
    {
        name: "Purple Haze", cost: 4, img: IMAGES["Purple Haze"],
        hp: 60000, attack: 5500, attack_range: 3, speed: 1.0, max_mana: 150,
        traits: ["Team Bucciarati", "Assassin"],
        skill: { type: 'aoe_dot', radius: 3, power: 12000, duration: 5.0 }
    },
    {
        name: "Aerosmith", cost: 4, img: IMAGES["Aerosmith"],
        hp: 70000, attack: 5000, attack_range: 4, speed: 1.5, max_mana: 150,
        traits: ["Team Bucciarati", "Sniper"],
        skill: { type: 'damage', power: 60000, duration: 0 }
    },
    {
        name: "Spice Girl", cost: 4, img: IMAGES["Spice Girl"],
        hp: 90000, attack: 4500, attack_range: 1, speed: 1.2, max_mana: 150,
        traits: ["Team Bucciarati", "Brawler"],
        skill: { type: 'stun', duration: 3 }
    },
    {
        name: "Metallica", cost: 4, img: IMAGES["Metallica"],
        hp: 80000, attack: 6000, attack_range: 5, speed: 1.5, max_mana: 150,
        traits: ["La Squadra", "Assassin"],
        skill: { type: 'dot', power: 15000, duration: 5 }
    },
    {
        name: "The Grateful Dead", cost: 4, img: IMAGES["The Grateful Dead"],
        hp: 90000, attack: 3700, attack_range: 1.5, speed: 0.8, max_mana: 150,
        traits: ["La Squadra", "Support"],
        skill: { type: 'aoe_dot', radius: 3, power: 6000, duration: 10 }
    },
    {
        name: "White Album", cost: 4, img: IMAGES["White Album"],
        hp: 100000, attack: 4000, attack_range: 1, speed: 1.3, max_mana: 150,
        traits: ["La Squadra", "Brawler"],
        skill: { type: 'mana_lock', duration: 5.0 }
    },
    {
        name: "Oasis", cost: 4, img: IMAGES["Oasis"],
        hp: 100000, attack: 5000, attack_range: 1, speed: 1.5, max_mana: 150,
        traits: ["Unita Speciale", "Brawler"],
        skill: { type: 'regen', power: 6000, duration: 10.0 }
    },
    {
        name: "Green Day", cost: 4, img: IMAGES["Green Day"],
        hp: 100000, attack: 5200, attack_range: 3, speed: 1.0, max_mana: 150,
        traits: ["Unita Speciale", "Mage"],
        skill: { type: 'aoe_dot', radius: 2.5, power: 20000, duration: 5 }
    },
    {
        name: "Notorious B.I.G", cost: 4, img: IMAGES["Notorious B.I.G"],
        hp: 200000, attack: 2000, attack_range: 1, speed: 0.5, max_mana: 150,
        traits: ["Unita Speciale", "Assassin"],
        skill: { type: 'clone', percent: 0.6 }
    },
    {
        name: "Undead Bruno", cost: 4, img: IMAGES["Undead Bruno"],
        hp: 80000, attack: 6000, attack_range: 1, speed: 1.2, max_mana: 150,
        traits: ["Team Bucciarati", "Brawler"],
        skill: { type: 'regen', power: 4000, duration: 15 }
    },
    {
        name: "Echoes Act 3", cost: 4, img: IMAGES["Echoes Act 3"],
        hp: 80000, attack: 8000, attack_range: 1.5, speed: 1.2, max_mana: 150,
        traits: ["Team Bucciarati", "Support"],
        skill: { type: 'stun', duration: 4.0 }
    },
    {
        name: "Clash", cost: 4, img: IMAGES["Clash"],
        hp: 70000, attack: 7000, attack_range: 1, speed: 1.4, max_mana: 150,
        traits: ["Unita Speciale", "Assassin"],
        skill: { type: 'swap', power: 45000 }
    },

    // --- TƯỚNG 5 VÀNG ---
    {
        name: "Gold Experience", cost: 5, img: IMAGES["Gold Experience"],
        hp: 50000, attack: 6000, attack_range: 4, speed: 1, max_mana: 150,
        traits: ["Team Bucciarati", "Support"],
        skill: { type: 'aoe_heal', radius: 5, power: 15000, duration: 10 }
    },
    {
        name: "King Crimson", cost: 5, img: IMAGES["King Crimson"],
        hp: 60000, attack: 8500, attack_range: 2, speed: 1.2, max_mana: 150,
        traits: ["Unita Speciale", "Assassin"],
        skill: { type: 'swap', power: 52500 }
    },
    {
        name: "G.E. Requiem", cost: 5, img: IMAGES["G.E. Requiem"],
        hp: 150000, attack: 9000, attack_range: 2, speed: 1.5, max_mana: 150,
        traits: ["Team Bucciarati", "Brawler"],
        skill: { type: 'mana_lock', duration: 6.0 }
    },
    {
        name: "Chariot Requiem", cost: 5, img: IMAGES["Chariot Requiem"],
        hp: 60000, attack: 10000, attack_range: 5, speed: 1.5, max_mana: 150,
        traits: ["Team Bucciarati", "Support"],
        skill: { type: 'stun', duration: 6.0 }
    },
    {
        name: "True King Crimson", cost: 5, img: IMAGES["True King Crimson"],
        hp: 85000, attack: 8500, attack_range: 1.5, speed: 1.5, max_mana: 150,
        traits: ["Unita Speciale", "Assassin"],
        skill: { type: 'speed_buff', power: 125, duration: 10 }
    },
    {
        name: "Requiem Arrow", cost: 5, img: IMAGES["Requiem Arrow"],
        hp: 150000, attack: 1500, attack_range: 5, speed: 1, max_mana: 150,
        traits: ["Artifact", "Support"],
        skill: { type: 'aoe_heal', radius: 10, power: 10000, duration: 15 }
    }
];