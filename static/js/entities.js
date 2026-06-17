// static/js/entities.js
import { IMAGES } from './assets.js';

export const CHAMPION_POOL = [
    // --- TƯỚNG 1 VÀNG ---
    {
        name: "Soft Machine", cost: 1, img: IMAGES["Soft Machine"],
        hp: 100000, attack: 3500, attack_range: 1, speed: 0.6, max_mana: 50,
        traits: ["Renegade", "Assassin"], skill: { type: 'buff_atk', power: 5000, duration: 5.0 }
    },
    {
        name: "Kraft Work", cost: 1, img: IMAGES["Kraft Work"],
        hp: 80000, attack: 4000, attack_range: 1, speed: 0.9, max_mana: 60,
        traits: ["Renegade", "Brawler"], skill: { type: 'regen', power: 2000, duration: 4.0 }
    },
    {
        name: "Little Feet", cost: 1, img: IMAGES["Little Feet"],
        hp: 70000, attack: 5000, attack_range: 1, speed: 1.2, max_mana: 50,
        traits: ["La Squadra", "Assassin"], skill: { type: 'buff_atk', power: 3000, duration: 4.0 }
    },
    {
        name: "Talking Head", cost: 1, img: IMAGES["Talking Head"],
        hp: 60000, attack: 3500, attack_range: 1, speed: 1.2, max_mana: 60,
        traits: ["Unita Speciale", "Support"], skill: { type: 'regen', power: 2000, duration: 5.0 }
    },
    {
        name: "Rolling Stones", cost: 1, img: IMAGES["Rolling Stones"],
        hp: 50000, attack: 0, attack_range: 1, speed: 0.5, max_mana: 40,
        traits: ["Renegade", "Support"], skill: { type: 'damage', power: 15000, duration: 0 }
    },

    // --- TƯỚNG 2 VÀNG ---
    {
        name: "Sex Pistols", cost: 2, img: IMAGES["Sex Pistols"],
        hp: 60000, attack: 8000, attack_range: 5, speed: 1.5, max_mana: 60,
        traits: ["Team Bucciarati", "Sniper"], skill: { type: 'damage', power: 18000, duration: 0 }
    },
    {
        name: "Black Sabbath", cost: 2, img: IMAGES["Black Sabbath"],
        hp: 60000, attack: 6000, attack_range: 1.5, speed: 0.7, max_mana: 80,
        traits: ["Renegade", "Mage"], skill: { type: 'regen', power: 3000, duration: 5.0 }
    },
    {
        name: "Baby Face", cost: 2, img: IMAGES["Baby Face"],
        hp: 60000, attack: 5500, attack_range: 2, speed: 1.0, max_mana: 70,
        traits: ["La Squadra", "Mage"], skill: { type: 'damage', power: 15000, duration: 0 }
    },
    {
        name: "Man in the Mirror", cost: 2, img: IMAGES["Man in the Mirror"],
        hp: 50000, attack: 5500, attack_range: 1.5, speed: 1.1, max_mana: 60,
        traits: ["La Squadra", "Mage"], skill: { type: 'damage', power: 12000, duration: 0 }
    },
    {
        name: "Beach Boy", cost: 2, img: IMAGES["Beach Boy"],
        hp: 60000, attack: 8000, attack_range: 4, speed: 0.9, max_mana: 60,
        traits: ["La Squadra", "Sniper"], skill: { type: 'damage', power: 18000, duration: 0 }
    },

    // --- TƯỚNG 3 VÀNG ---
    {
        name: "Moody Blues", cost: 3, img: IMAGES["Moody Blues"],
        hp: 80000, attack: 7000, attack_range: 1, speed: 0.8, max_mana: 70,
        traits: ["Team Bucciarati", "Support"], skill: { type: 'buff_atk', power: 4000, duration: 4.0 }
    },
    {
        name: "Silver Chariot", cost: 3, img: IMAGES["Silver Chariot"],
        hp: 70000, attack: 9000, attack_range: 1, speed: 2.0, max_mana: 60,
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'damage', power: 12000, duration: 0 }
    },
    {
        name: "Stand Arrow", cost: 3, img: IMAGES["Stand Arrow"],
        hp: 40000, attack: 0, attack_range: 1, speed: 0.5, max_mana: 40,
        traits: ["Artifact", "Support"], skill: { type: 'heal', power: 20000, duration: 0 }
    },

    // --- TƯỚNG 4 VÀNG ---
    {
        name: "Sticky Fingers", cost: 4, img: IMAGES["Sticky Fingers"],
        hp: 70000, attack: 6500, attack_range: 1, speed: 1.3, max_mana: 80,
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'damage', power: 15000, duration: 0 }
    },
    {
        name: "Purple Haze", cost: 4, img: IMAGES["Purple Haze"],
        hp: 60000, attack: 7000, attack_range: 1, speed: 1.0, max_mana: 90,
        traits: ["Team Bucciarati", "Assassin"], skill: { type: 'buff_atk', power: 12000, duration: 3.0 }
    },
    {
        name: "Aerosmith", cost: 4, img: IMAGES["Aerosmith"],
        hp: 70000, attack: 6000, attack_range: 4, speed: 1.8, max_mana: 100,
        traits: ["Team Bucciarati", "Sniper"], skill: { type: 'damage', power: 25000, duration: 0 }
    },
    {
        name: "Spice Girl", cost: 4, img: IMAGES["Spice Girl"],
        hp: 90000, attack: 6500, attack_range: 1, speed: 1.2, max_mana: 75,
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'buff_atk', power: 8000, duration: 3.5 }
    },
    {
        name: "Metallica", cost: 4, img: IMAGES["Metallica"],
        hp: 80000, attack: 6000, attack_range: 2, speed: 1.3, max_mana: 80,
        traits: ["La Squadra", "Assassin"], skill: { type: 'damage', power: 22000, duration: 0 }
    },
    {
        name: "The Grateful Dead", cost: 4, img: IMAGES["The Grateful Dead"],
        hp: 90000, attack: 4500, attack_range: 1, speed: 0.8, max_mana: 90,
        traits: ["La Squadra", "Support"], skill: { type: 'heal', power: 15000, duration: 0 }
    },
    {
        name: "White Album", cost: 4, img: IMAGES["White Album"],
        hp: 100000, attack: 4000, attack_range: 1, speed: 1.0, max_mana: 80,
        traits: ["La Squadra", "Brawler"], skill: { type: 'heal', power: 25000, duration: 0 }
    },
    {
        name: "Oasis", cost: 4, img: IMAGES["Oasis"],
        hp: 100000, attack: 6500, attack_range: 1, speed: 1.5, max_mana: 70,
        traits: ["Unita Speciale", "Brawler"], skill: { type: 'buff_atk', power: 6000, duration: 4.0 }
    },
    {
        name: "Green Day", cost: 4, img: IMAGES["Green Day"],
        hp: 100000, attack: 10000, attack_range: 3, speed: 1.0, max_mana: 80,
        traits: ["Unita Speciale", "Mage"], skill: { type: 'damage', power: 20000, duration: 0 }
    },
    {
        name: "Notorious B.I.G", cost: 4, img: IMAGES["Notorious B.I.G"],
        hp: 200000, attack: 5000, attack_range: 1, speed: 0.4, max_mana: 50,
        traits: ["Unita Speciale", "Assassin"], skill: { type: 'heal', power: 30000, duration: 0 }
    },
    {
        name: "Undead Bruno", cost: 4, img: IMAGES["Undead Bruno"],
        hp: 80000, attack: 7000, attack_range: 1, speed: 1.2, max_mana: 70,
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'regen', power: 4000, duration: 5.0 }
    },

    // --- TƯỚNG 5 VÀNG ---
    {
        name: "Gold Experience", cost: 5, img: IMAGES["Gold Experience"],
        hp: 50000, attack: 8000, attack_range: 1, speed: 1.2, max_mana: 100,
        traits: ["Team Bucciarati", "Support"], skill: { type: 'heal', power: 20000, duration: 0 }
    },
    {
        name: "King Crimson", cost: 5, img: IMAGES["King Crimson"],
        hp: 60000, attack: 12000, attack_range: 1, speed: 1.4, max_mana: 100,
        traits: ["Unita Speciale", "Assassin"], skill: { type: 'damage', power: 35000, duration: 0 }
    },
    {
        name: "G.E. Requiem", cost: 5, img: IMAGES["G.E. Requiem"],
        hp: 150000, attack: 15000, attack_range: 2, speed: 1.5, max_mana: 120,
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'buff_atk', power: 50000, duration: 5.0 }
    },
    {
        name: "Chariot Requiem", cost: 5, img: IMAGES["Chariot Requiem"],
        hp: 60000, attack: 10000, attack_range: 2, speed: 1.0, max_mana: 90,
        traits: ["Team Bucciarati", "Support"], skill: { type: 'regen', power: 5000, duration: 4.0 }
    },
    {
        name: "True King Crimson", cost: 5, img: IMAGES["True King Crimson"],
        hp: 85000, attack: 13000, attack_range: 1, speed: 1.5, max_mana: 90,
        traits: ["Unita Speciale", "Assassin"], skill: { type: 'damage', power: 25000, duration: 0 }
    },
    {
        name: "Requiem Arrow", cost: 5, img: IMAGES["Requiem Arrow"],
        hp: 50000, attack: 0, attack_range: 1, speed: 0.5, max_mana: 50,
        traits: ["Artifact", "Support"], skill: { type: 'buff_atk', power: 20000, duration: 5.0 }
    }
];
// (Lưu ý: Phần TRAITS_INFO ở bên globals.js vẫn giữ nguyên nhé)