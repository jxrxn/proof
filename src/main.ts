import './style.css';
import { initStamp } from './stamp';
import { initVerify, type VerifyPanel } from './verify';

// Ny input på ena sidan nollställer den andra, så att kortens innehåll aldrig
// visar resultat som hör till en tidigare fil/text.
let verifyPanel: VerifyPanel | undefined;
const stampPanel = initStamp({ onInputActivity: () => verifyPanel?.resetPanel() });
verifyPanel = initVerify({ onInputActivity: () => stampPanel.resetPanel() });
