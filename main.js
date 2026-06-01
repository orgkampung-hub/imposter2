const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const screen = ref('login');
        const myId = ref('');
        const myName = ref('');
        const peerIdInput = ref('');
        const kodBilik = ref('');
        
        const maxPlayers = ref(4);
        const jumlahImposterPilihan = ref(1); // Default kepada 1 Imposter
        const isHost = ref(false);
        const senaraiPemain = ref([]); 
        
        const myRole = ref('');
        const kategoriKunci = ref('');
        const kataKunci = ref('');
        const kataKunciImposter = ref('');
        
        const isRevealed = ref(false); 

        const statusGame = ref('perbincangan'); 
        const sudahUndi = ref(false);
        const pilihanSaya = ref('');
        const maklumatTamat = ref('');
        const senaraiUndiDiterima = ref([]); 

        let peer = null;
        let senaraiConn = []; 
        let connToHost = null; 
        let databasePerkataan = []; 
        
        // --- LOGIK ANTI-ULANG PERKATAAN ---
        let bakiPerkataan = []; 

        onMounted(() => {
            const savedName = localStorage.getItem('imp_user_name');
            if (savedName) myName.value = savedName;
        });

        const handleLogin = () => {
            if (!myName.value.trim()) return;
            localStorage.setItem('imp_user_name', myName.value);
            
            myId.value = Math.random().toString(36).substring(2, 6).toUpperCase();
            peer = new Peer(myId.value);
            
            peer.on('open', () => {
                screen.value = 'menu';
            });

            peer.on('error', (err) => {
                alert("Ralat Rangkaian PeerJS: " + err.type);
                window.location.reload();
            });
        };

        const buatBilik = async () => {
            isHost.value = true;
            kodBilik.value = myId.value;
            screen.value = 'lobby';
            
            senaraiPemain.value.push({
                id: myId.value,
                nama: myName.value,
                role: 'Sivil',
                point: 0,
                undian: 0,
                pilihanUndi: ''
            });

            await muatTurunPerkataan();

            peer.on('connection', (conn) => {
                if (senaraiPemain.value.length >= maxPlayers.value || screen.value !== 'lobby') {
                    setTimeout(() => conn.close(), 500);
                    return;
                }

                senaraiConn.push(conn);

                conn.on('data', (data) => {
                    if (data.type === 'DAFTAR_NAMA') {
                        senaraiPemain.value.push({
                            id: conn.peer,
                            nama: data.nama,
                            role: 'Sivil',
                            point: 0,
                            undian: 0,
                            pilihanUndi: ''
                        });
                        hantarKemaskiniLobby();
                    }

                    if (data.type === 'HANTAR_UNDI') {
                        prosesMekanikUndi(data.pengundi, data.daundi);
                    }
                });

                conn.on('close', () => {
                    senaraiConn = senaraiConn.filter(c => c.peer !== conn.peer);
                    senaraiPemain.value = senaraiPemain.value.filter(p => p.id !== conn.peer);
                    hantarKemaskiniLobby();
                });
            });
        };

        const hantarKemaskiniLobby = () => {
            senaraiConn.forEach(c => {
                if (c.open) {
                    c.send({
                        type: 'KEMASKINI_LOBBY',
                        pemain: senaraiPemain.value,
                        max: maxPlayers.value
                    });
                }
            });
        };

        const sertaiBilik = () => {
            if (!peerIdInput.value.trim()) return;
            isHost.value = false;
            kodBilik.value = peerIdInput.value.toUpperCase();
            
            connToHost = peer.connect(kodBilik.value);
            
            connToHost.on('open', () => {
                screen.value = 'lobby';
                connToHost.send({ type: 'DAFTAR_NAMA', nama: myName.value });
            });

            connToHost.on('data', (data) => {
                if (data.type === 'KEMASKINI_LOBBY') {
                    senaraiPemain.value = data.pemain;
                    maxPlayers.value = data.max;
                }
                if (data.type === 'MULA_GAME') {
                    senaraiPemain.value = data.pemain;
                    kategoriKunci.value = data.kategori;
                    kataKunci.value = data.sivil;
                    kataKunciImposter.value = data.imposter;
                    jumlahImposterPilihan.value = data.totalImposters;
                    
                    const saya = data.pemain.find(p => p.id === myId.value);
                    myRole.value = saya ? saya.role : 'Sivil';
                    
                    statusGame.value = 'perbincangan';
                    sudahUndi.value = false;
                    pilihanSaya.value = '';
                    isRevealed.value = false; 
                    screen.value = 'game';
                }
                if (data.type === 'MASUK_FASA_UNDI') {
                    statusGame.value = 'undian';
                }
                if (data.type === 'TAMAT_ROUND') {
                    senaraiPemain.value = data.pemain;
                    maklumatTamat.value = data.mesej;
                    screen.value = 'result';
                }
            });

            connToHost.on('close', () => {
                alert('Talian ke peranti Host terputus!');
                window.location.reload();
            });
        };

        const muatTurunPerkataan = async () => {
            try {
                const res = await fetch('words.json');
                databasePerkataan = await res.json();
            } catch (e) {
                databasePerkataan = [{ kategori: "Makanan", sivil: "Nasi Lemak", imposter: "Bersambal" }];
            }
            // Isikan bakul penjejak baki perkataan pada permulaan game
            bakiPerkataan = [...databasePerkataan];
        };

        const mulaPermainan = () => {
            const totalPemain = senaraiPemain.value.length;
            if (totalPemain < 2) return; 

            // Had keselamatan bilangan imposter
            let impostersToAssign = jumlahImposterPilihan.value;
            if (impostersToAssign >= totalPemain) {
                impostersToAssign = Math.max(1, totalPemain - 1);
            }

            // Kocok senarai indeks pemain (Fisher-Yates Shuffle)
            let indeksArray = Array.from({ length: totalPemain }, (_, i) => i);
            for (let i = indeksArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indeksArray[i], indeksArray[j]] = [indeksArray[j], indeksArray[i]];
            }
            const indeksImposters = indeksArray.slice(0, impostersToAssign);

            senaraiPemain.value.forEach((p, idx) => {
                p.role = indeksImposters.includes(idx) ? 'Imposter' : 'Sivil';
                p.undian = 0;
                p.pilihanUndi = '';
            });

            // --- PROSES CABUT & BUANG PERKATAAN UNTUK ANTI-ULANG ---
            if (bakiPerkataan.length === 0) {
                // Jika semua perkataan dalam bakul dah habis digunakan, isi semula bakul baru
                bakiPerkataan = [...databasePerkataan];
            }
            
            // Pilih satu index secara rawak daripada baki perkataan yang ada
            const indexRawakPerkataan = Math.floor(Math.random() * bakiPerkataan.length);
            
            // Cabut keluar (splice) item tersebut supaya ia dibuang terus dari bakiPerkataan
            const itemTerpilih = bakiPerkataan.splice(indexRawakPerkataan, 1)[0];

            kategoriKunci.value = itemTerpilih.kategori;
            kataKunci.value = itemTerpilih.sivil;
            kataKunciImposter.value = itemTerpilih.imposter;

            const saya = senaraiPemain.value.find(p => p.id === myId.value);
            myRole.value = saya.role;

            senaraiConn.forEach(c => {
                if (c.open) {
                    c.send({
                        type: 'MULA_GAME',
                        pemain: senaraiPemain.value,
                        kategori: kategoriKunci.value,
                        sivil: kataKunci.value,
                        imposter: kataKunciImposter.value,
                        totalImposters: impostersToAssign
                    });
                }
            });

            statusGame.value = 'perbincangan';
            sudahUndi.value = false;
            pilihanSaya.value = '';
            isRevealed.value = false; 
            senaraiUndiDiterima.value = [];
            screen.value = 'game';
        };

        const tukarFasaUndian = () => {
            statusGame.value = 'undian';
            senaraiConn.forEach(c => {
                if (c.open) c.send({ type: 'MASUK_FASA_UNDI' });
            });
        };

        const mengundi = (idCalon) => {
            let targetUndi = idCalon;

            if (pilihanSaya.value === idCalon) {
                targetUndi = ''; 
                pilihanSaya.value = '';
            } else {
                pilihanSaya.value = idCalon; 
            }
            
            if (isHost.value) {
                prosesMekanikUndi(myId.value, targetUndi);
            } else {
                connToHost.send({ type: 'HANTAR_UNDI', pengundi: myId.value, daundi: targetUndi });
            }
        };

        const prosesMekanikUndi = (dariId, keId) => {
            const pengundi = senaraiPemain.value.find(p => p.id === dariId);
            if (pengundi) pengundi.pilihanUndi = keId;

            if (keId === '') {
                senaraiUndiDiterima.value = senaraiUndiDiterima.value.filter(id => id !== dariId);
            } else {
                if (!senaraiUndiDiterima.value.includes(dariId)) {
                    senaraiUndiDiterima.value.push(dariId);
                }
            }

            if (senaraiUndiDiterima.value.length >= senaraiPemain.value.length) {
                kiraKiraanMataRound();
            }
        };

        const kiraKiraanMataRound = () => {
            senaraiPemain.value.forEach(p => p.undian = 0);
            
            senaraiPemain.value.forEach(p => {
                const sasaran = senaraiPemain.value.find(c => c.id === p.pilihanUndi);
                if (sasaran) sasaran.undian++;
            });

            const senaraiImposter = senaraiPemain.value.filter(p => p.role === 'Imposter');
            const namaImposters = senaraiImposter.map(i => i.nama).join(', ');

            let idUndianTertinggi = '';
            let nilaiMax = -1;
            let isSeri = false;

            senaraiPemain.value.forEach(p => {
                if (p.undian > nilaiMax) {
                    nilaiMax = p.undian;
                    idUndianTertinggi = p.id;
                    isSeri = false;
                } else if (p.undian === nilaiMax && nilaiMax > 0) {
                    isSeri = true;
                }
            });

            let ringkasan = `--- KEPUTUSAN ROUND ---\n\n`;
            ringkasan += `Kategori: ${kategoriKunci.value}\n`;
            ringkasan += `Kata Kunci Sivil: ${kataKunci.value}\n`;
            ringkasan += `Kata Kunci Imposter: ${kataKunciImposter.value}\n`;
            ringkasan += `Identiti Imposter: ${namaImposters}\n\n`;

            const mangsaUndi = senaraiPemain.value.find(p => p.id === idUndianTertinggi);

            if (!isSeri && mangsaUndi && mangsaUndi.role === 'Imposter') {
                mangsaUndi.point -= 1;
                ringkasan += `💥 KANTOI! Meja makan berjaya menyingkirkan Imposter (${mangsaUndi.nama}).\n\n📊 Kemaskini Mata:\n`;
                
                senaraiPemain.value.forEach(p => {
                    if (p.role === 'Sivil') {
                        if (p.pilihanUndi === idUndianTertinggi) {
                            p.point += 1;
                            ringkasan += `- ${p.nama}: +1 Point (Teka Tepat)\n`;
                        } else {
                            ringkasan += `- ${p.nama}: 0 Point\n`;
                        }
                    } else {
                        if (p.id !== idUndianTertinggi) {
                            p.point += 2;
                            ringkasan += `- ${p.nama} (Imposter Terlepas): +2 Point\n`;
                        } else {
                            ringkasan += `- ${p.nama} (Imposter Tertangkap): -1 Point\n`;
                        }
                    }
                });
            } else {
                ringkasan += `🎭 TERLEPAS! Imposter berjaya memperdayakan ahli meja.\n`;
                if (isSeri) ringkasan += `(Undian tertinggi berakhir dengan keputusan seri!)\n`;
                
                ringkasan += `\n📊 Kemaskini Mata:\n`;
                senaraiPemain.value.forEach(p => {
                    if (p.role === 'Sivil') {
                        ringkasan += `- ${p.nama}: 0 Point\n`;
                    } else {
                        p.point += 3;
                        ringkasan += `- ${p.nama} (Imposter): +3 Point\n`;
                    }
                });
            }

            senaraiConn.forEach(c => {
                if (c.open) {
                    c.send({
                        type: 'TAMAT_ROUND',
                        pemain: senaraiPemain.value,
                        mesej: ringkasan
                    });
                }
            });

            maklumatTamat.value = ringkasan;
            screen.value = 'result';
        };

        const nextRound = () => { mulaPermainan(); };
        const keluarGame = () => { window.location.reload(); };
        const padamNama = () => { localStorage.clear(); window.location.reload(); };

        const susunPemain = computed(() => {
            return [...senaraiPemain.value].sort((a, b) => b.point - a.point);
        });

        return {
            screen, myId, myName, peerIdInput, kodBilik, maxPlayers, jumlahImposterPilihan, isHost, senaraiPemain,
            myRole, kategoriKunci, kataKunci, kataKunciImposter, isRevealed, statusGame, sudahUndi, pilihanSaya, maklumatTamat,
            handleLogin, buatBilik, sertaiBilik, mulaPermainan, tukarFasaUndian, mengundi, nextRound, keluarGame, padamNama,
            susunPemain
        };
    }
}).mount('#app');
