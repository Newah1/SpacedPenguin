import Utils from '../utils.js';

const STYLE_ID = 'spaced-penguin-community-leaderboard-style';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .community-leaderboard { margin:16px 0; padding:14px 16px; border:1px solid #6d4a35;
            border-radius:9px; background:#17130f; color:#e4d8bd; text-align:left; }
        .community-leaderboard h3 { margin:0 0 10px; color:#ffd98c; font-size:17px; text-align:center; }
        .community-leaderboard ol { display:grid; gap:3px; max-width:340px; margin:0 auto; padding:0;
            list-style:none; font-variant-numeric:tabular-nums; }
        .community-leaderboard li { display:grid; grid-template-columns:28px minmax(0,1fr) auto;
            align-items:center; gap:10px; padding:5px 7px; border-radius:5px; }
        .community-leaderboard li:nth-child(odd) { background:rgba(255,243,187,.055); }
        .community-leaderboard-rank { color:#a99576; text-align:right; }
        .community-leaderboard-initials { color:#fff3bb; letter-spacing:.1em; }
        .community-leaderboard-score { text-align:right; }
        .community-leaderboard-message { margin:8px 0; color:#cbbda2; text-align:center; }
        .community-leaderboard-message.is-error { color:#ff9a85; }
    `;
    document.head.appendChild(style);
}

export function createCommunityLeaderboard(scores = [], options = {}) {
    ensureStyles();
    const section = document.createElement('section');
    section.className = 'community-leaderboard';
    const title = document.createElement('h3');
    title.textContent = options.title || 'Top Scores';
    section.appendChild(title);

    if (options.loading || options.error || scores.length === 0) {
        const message = document.createElement('p');
        message.className = 'community-leaderboard-message';
        if (options.error) message.classList.add('is-error');
        message.textContent = options.loading
            ? 'Loading scores…'
            : options.error || options.emptyText || 'No scores yet—be the first!';
        section.appendChild(message);
        return section;
    }

    const list = document.createElement('ol');
    scores.forEach((score, index) => {
        const row = document.createElement('li');
        const rank = document.createElement('span');
        rank.className = 'community-leaderboard-rank';
        rank.textContent = `${index + 1}.`;
        const initials = document.createElement('strong');
        initials.className = 'community-leaderboard-initials';
        initials.textContent = score.initials || '---';
        const value = document.createElement('span');
        value.className = 'community-leaderboard-score';
        value.textContent = Utils.formatScore(Number(score.score) || 0);
        row.append(rank, initials, value);
        list.appendChild(row);
    });
    section.appendChild(list);
    return section;
}
