const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');

class PDFService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '../../uploads');
    this.ensureUploadsDir();
  }

    ensureUploadsDir() {
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
        console.log('📁 Dossier uploads créé:', this.uploadsDir);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la création du dossier uploads:', error);
      throw error;
    }
  }

  async generateTransactionsReport(caisse, transactions, summary) {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔍 Début de la génération du PDF...');
        
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        const filename = `rapport_transactions_${caisse.nom}_${new Date().toISOString().split('T')[0]}.pdf`;
        const filepath = path.join(this.uploadsDir, filename);
        
        console.log('📁 Chemin du fichier:', filepath);
        
        const stream = fs.createWriteStream(filepath);

        doc.pipe(stream);

        // En-tête du document
        console.log('📝 Ajout de l\'en-tête...');
        this.addHeader(doc, caisse);
        
        // Résumé du solde
        console.log('💰 Ajout du résumé du solde...');
        this.addBalanceSummary(doc, summary, caisse.devise);
        
        // Tableau des transactions
        console.log('📊 Ajout du tableau des transactions...');
        this.addTransactionsTable(doc, transactions, caisse.devise);
        
        // Pied de page
        console.log('📄 Ajout du pied de page...');
        this.addFooter(doc);

        console.log('✅ Finalisation du PDF...');
        doc.end();

        stream.on('finish', () => {
          console.log('✅ PDF généré avec succès:', filepath);
          resolve({ filename, filepath });
        });

        stream.on('error', (error) => {
          console.error('❌ Erreur du stream:', error);
          reject(error);
        });

      } catch (error) {
        console.error('❌ Erreur lors de la génération du PDF:', error);
        reject(error);
      }
    });
  }

  addHeader(doc, caisse) {
    // Titre principal
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text('RAPPORT DES TRANSACTIONS', { align: 'center' })
       .moveDown(0.5);

    // Informations de la caisse
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text(`Caisse: ${caisse.nom}`, { align: 'center' })
       .moveDown(0.5);

    doc.fontSize(12)
       .font('Helvetica')
       .text(`Code: ${caisse.code_caisse}`, { align: 'center' })
       .text(`Devise: ${caisse.devise}`, { align: 'center' })
       .text(`Emplacement: ${caisse.emplacement || 'Non spécifié'}`, { align: 'center' })
       .moveDown(1);

    // Date de génération
    doc.fontSize(10)
       .font('Helvetica-Oblique')
       .text(`Généré le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, { align: 'right' })
       .moveDown(1);

    // Ligne de séparation
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke()
       .moveDown(1);
  }

  addBalanceSummary(doc, summary, devise) {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('RÉSUMÉ DU SOLDE', { underline: true })
       .moveDown(0.5);

    // Grille des informations
    const startY = doc.y;
    const colWidth = 120;
    const rowHeight = 25;

    // Solde Initial
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Solde Initial:', 50, startY)
       .font('Helvetica')
       .text(`${summary.soldeInitial} ${devise}`, 50 + colWidth, startY);

    // Total Paiements
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Total Paiements:', 50, startY + rowHeight)
       .font('Helvetica')
       .fillColor('green')
       .text(`+${summary.totalPaiements} ${devise}`, 50 + colWidth, startY + rowHeight)
       .fillColor('black');

    // Total Dépenses
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Total Dépenses:', 50, startY + rowHeight * 2)
       .font('Helvetica')
       .fillColor('red')
       .text(`-${summary.totalDepensesComplet} ${devise}`, 50 + colWidth, startY + rowHeight * 2)
       .fillColor('black');

    // Solde Calculé
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Solde Calculé:', 50, startY + rowHeight * 3)
       .font('Helvetica')
       .fillColor('purple')
       .text(`${summary.soldeCalcule} ${devise}`, 50 + colWidth, startY + rowHeight * 3)
       .fillColor('black');

    // Détail des dépenses
    doc.moveDown(1);
    doc.fontSize(10)
       .font('Helvetica-Oblique')
       .text(`Détail: Dépenses régulières: -${summary.totalDepenses} ${devise}, Paiements partiels: -${summary.totalPaiementsPartiels} ${devise}`)
       .moveDown(1);

    // Ligne de séparation
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke()
       .moveDown(1);
  }

  addTransactionsTable(doc, transactions, devise) {
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('DÉTAIL DES TRANSACTIONS', { underline: true })
       .moveDown(0.5);

    if (transactions.length === 0) {
      doc.fontSize(12)
         .font('Helvetica')
         .text('Aucune transaction trouvée.')
         .moveDown(1);
      return;
    }

    // En-têtes du tableau avec largeurs optimisées et positions calculées
    const headers = ['Date', 'Référence', 'Type', 'Montant', 'Statut', 'Description'];
    const colWidths = [70, 90, 80, 80, 70, 150];
    const colPositions = [50, 120, 210, 290, 370, 440]; // Positions X calculées
    const startY = doc.y;

    // Dessiner les en-têtes avec une couleur plus professionnelle
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('white');

    headers.forEach((header, index) => {
      doc.rect(colPositions[index], startY, colWidths[index], 25)
         .fillAndStroke('#2c3e50', '#34495e'); // Bleu foncé professionnel
      
      doc.fillColor('white')
         .text(header, colPositions[index] + 5, startY + 8, { width: colWidths[index] - 10, align: 'center' });
    });

    doc.fillColor('black');
    doc.moveDown(0.5);

    // Contenu du tableau avec hauteur de ligne adaptative et alignement précis
    let currentY = startY + 30;
    transactions.forEach((transaction, index) => {
      // Vérifier si on doit passer à la page suivante
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      // Calculer la hauteur nécessaire pour cette ligne
      const description = transaction.description || 'Aucune description';
      const descriptionLines = this.wrapText(description, colWidths[5] - 10, doc);
      const lineHeight = Math.max(35, descriptionLines.length * 16 + 20);

      // Ligne de fond avec couleurs plus douces
      if (index % 2 === 0) {
        doc.rect(50, currentY, 560, lineHeight)
           .fillAndStroke('#f8f9fa', '#e9ecef'); // Gris très clair avec bordure douce
      } else {
        doc.rect(50, currentY, 560, lineHeight)
           .fillAndStroke('white', '#e9ecef'); // Blanc avec bordure douce
      }

      // Date avec formatage amélioré - Position précise
      const date = transaction.date_paiement || transaction.date_depense || transaction.date;
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50') // Texte foncé pour la lisibilité
         .text(this.formatDate(date), colPositions[0] + 5, currentY + 12, { width: colWidths[0] - 10, align: 'left' });

      // Référence - Position précise
      const reference = transaction.reference || transaction.numero_facture || 'N/A';
      doc.font('Helvetica')
         .fillColor('#34495e')
         .text(reference, colPositions[1] + 5, currentY + 12, { width: colWidths[1] - 10, align: 'left' });

      // Type avec couleur selon le type - Position précise
      const type = transaction.type_paiement || 'N/A';
      const typeColor = this.getTypeColor(type);
      doc.font('Helvetica-Bold')
         .fillColor(typeColor)
         .text(type, colPositions[2] + 5, currentY + 12, { width: colWidths[2] - 10, align: 'left' });

      // Montant avec formatage et couleur - Position précise
      const montant = parseFloat(transaction.montant || 0).toFixed(2);
      const deviseText = transaction.devise || devise;
      const montantComplet = `${montant} ${deviseText}`;
      const montantColor = this.getMontantColor(transaction.type_paiement);
      doc.font('Helvetica-Bold')
         .fillColor(montantColor)
         .text(montantComplet, colPositions[3] + 5, currentY + 12, { width: colWidths[3] - 10, align: 'right' });

      // Statut avec couleur appropriée - Position précise
      const statut = transaction.statut || 'N/A';
      const statutColor = this.getStatutColor(statut);
      doc.font('Helvetica-Bold')
         .fillColor(statutColor)
         .text(statut, colPositions[4] + 5, currentY + 12, { width: colWidths[4] - 10, align: 'center' });

      // Description avec gestion du retour à la ligne et couleur - Position précise
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#2c3e50'); // Texte foncé pour la lisibilité
      
      let descY = currentY + 12;
      descriptionLines.forEach((line, lineIndex) => {
        doc.text(line, colPositions[5] + 5, descY, { width: colWidths[5] - 10, align: 'left' });
        descY += 16;
      });

      currentY += lineHeight + 3;
    });

    doc.moveDown(1);
  }

  addFooter(doc) {
    const pageCount = doc.bufferedPageRange().count;
    
    for (let i = 1; i <= pageCount; i++) {
      doc.switchToPage(i);
      
      // Numéro de page
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Page ${i} sur ${pageCount}`, 50, 800, { align: 'center' });
      
      // Ligne de séparation
      doc.moveTo(50, 790)
         .lineTo(545, 790)
         .stroke();
    }
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  formatDateLong(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  wrapText(text, maxWidth, doc) {
    if (!text || text.length === 0) return ['Aucune description'];
    
    // Nettoyer le texte des caractères spéciaux
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (cleanText.length === 0) return ['Aucune description'];
    
    const words = cleanText.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = doc.widthOfString(testLine);
      
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        // Si le mot seul est trop long, le couper
        if (doc.widthOfString(word) > maxWidth) {
          // Couper le mot en caractères
          let partialWord = '';
          for (let i = 0; i < word.length; i++) {
            const testChar = partialWord + word[i];
            if (doc.widthOfString(testChar) <= maxWidth) {
              partialWord = testChar;
            } else {
              if (partialWord) {
                lines.push(partialWord);
              }
              partialWord = word[i];
            }
          }
          if (partialWord) {
            currentLine = partialWord;
          } else {
            currentLine = '';
          }
        } else {
          currentLine = word;
        }
      }
    });
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Limiter le nombre de lignes pour éviter les débordements
    if (lines.length > 5) {
      lines.splice(5);
      lines[4] = lines[4].substring(0, lines[4].length - 3) + '...';
    }
    
    return lines.length > 0 ? lines : ['Aucune description'];
  }

  getTypeColor(type) {
    switch (type) {
      case 'Espèces':
        return '#27ae60'; // Vert pour les espèces
      case 'Carte bancaire':
        return '#3498db'; // Bleu pour la carte
      case 'Chèque':
        return '#9b59b6'; // Violet pour le chèque
      case 'Virement':
        return '#e67e22'; // Orange pour le virement
      case 'Dépense':
        return '#e74c3c'; // Rouge pour les dépenses
      case 'Dépense Partielle':
        return '#c0392b'; // Rouge foncé pour les dépenses partielles
      default:
        return '#2c3e50'; // Bleu foncé par défaut
    }
  }

  getMontantColor(type) {
    if (type === 'Dépense' || type === 'Dépense Partielle') {
      return '#e74c3c'; // Rouge pour les dépenses
    } else {
      return '#27ae60'; // Vert pour les paiements
    }
  }

  getStatutColor(statut) {
    switch (statut) {
      case 'Validé':
        return '#27ae60'; // Vert pour validé
      case 'Approuvée':
        return '#3498db'; // Bleu pour approuvée
      case 'Payée':
        return '#27ae60'; // Vert pour payée
      case 'En attente':
        return '#f39c12'; // Orange pour en attente
      case 'Rejeté':
        return '#e74c3c'; // Rouge pour rejeté
      default:
        return '#2c3e50'; // Bleu foncé par défaut
    }
  }

  /**
   * Génère un PDF de facture (design selon template_code: minimal, modern, classic)
   * @param {Object} facture - FactureFin
   * @param {Array} lignes - LigneFactureFin[]
   * @returns {Promise<{buffer: Buffer}>}
   */
  async generateFacturePDF(facture, lignes = []) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve({ buffer: Buffer.concat(chunks) }));
        doc.on('error', reject);

        const template = (facture.template_code || 'modern').toLowerCase();
        const devise = facture.devise || 'FC';
        const totalHT = parseFloat(facture.total_ht || 0);
        const totalTVA = parseFloat(facture.total_tva || 0);
        const totalTTC = parseFloat(facture.total_ttc || 0);

        if (template === 'minimal') {
          this._factureMinimal(doc, facture, lignes, devise, totalHT, totalTVA, totalTTC);
        } else if (template === 'classic') {
          this._factureClassic(doc, facture, lignes, devise, totalHT, totalTVA, totalTTC);
        } else {
          this._factureModern(doc, facture, lignes, devise, totalHT, totalTVA, totalTTC);
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  _factureMinimal(doc, facture, lignes, devise, totalHT, totalTVA, totalTTC) {
    doc.fontSize(10).font('Helvetica');
    doc.text('FACTURE', 50, 50).moveDown(0.3);
    doc.font('Helvetica-Bold').text(facture.numero, 50, doc.y).moveDown(0.5);
    doc.font('Helvetica');
    doc.text(`Date: ${this.formatDate(facture.date_facture)}`, 50, doc.y);
    if (facture.date_echeance) doc.text(`Échéance: ${this.formatDate(facture.date_echeance)}`, 50, doc.y + 14);
    doc.moveDown(1);
    doc.text(`Client: ${facture.client_nom || ''}`, 50, doc.y);
    if (facture.client_adresse) doc.text(facture.client_adresse, 50, doc.y + 14);
    if (facture.client_email) doc.text(facture.client_email, 50, doc.y + 28);
    doc.moveDown(1.5);
    const startY = doc.y;
    doc.font('Helvetica-Bold').text('Désignation', 50, startY).text('Qté', 320, startY).text('P.U', 380, startY).text('Montant TTC', 480, startY);
    doc.moveTo(50, startY + 12).lineTo(545, startY + 12).stroke();
    doc.font('Helvetica');
    let y = startY + 22;
    (lignes || []).forEach((l) => {
      doc.text((l.libelle || '').substring(0, 45), 50, y, { width: 260 });
      doc.text(parseFloat(l.quantite || 0).toFixed(2), 320, y);
      doc.text(parseFloat(l.prix_unitaire || 0).toFixed(2), 380, y);
      doc.text(`${parseFloat(l.montant_ttc || 0).toFixed(2)} ${devise}`, 460, y);
      y += 20;
    });
    y += 10;
    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 18;
    doc.text(`Total HT: ${totalHT.toFixed(2)} ${devise}`, 380, y);
    y += 16;
    doc.text(`TVA: ${totalTVA.toFixed(2)} ${devise}`, 380, y);
    y += 16;
    doc.font('Helvetica-Bold').text(`Total TTC: ${totalTTC.toFixed(2)} ${devise}`, 380, y);
    doc.fontSize(8).font('Helvetica').text(`Statut: ${facture.statut || 'brouillon'}`, 50, 800);
  }

  _factureClassic(doc, facture, lignes, devise, totalHT, totalTVA, totalTTC) {
    doc.rect(50, 45, 495, 35).fillAndStroke('#f5f5f5', '#ddd');
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('FACTURE', 60, 55);
    doc.fontSize(11).font('Helvetica').text(facture.numero, 400, 55);
    doc.text(`Date: ${this.formatDate(facture.date_facture)}`, 400, 68);
    doc.moveDown(2);
    doc.fillColor('black');
    doc.font('Helvetica-Bold').text('Client', 50, doc.y);
    doc.font('Helvetica');
    doc.text(facture.client_nom || '', 50, doc.y + 14);
    if (facture.client_adresse) doc.text(facture.client_adresse, 50, doc.y + 28);
    if (facture.client_email) doc.text(facture.client_email, 50, doc.y + 42);
    doc.moveDown(1.2);
    const startY = doc.y;
    doc.rect(50, startY, 495, 22).fillAndStroke('#e8e8e8', '#ccc');
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Désignation', 55, startY + 6).text('Qté', 300, startY + 6).text('P.U HT', 350, startY + 6).text('TVA %', 410, startY + 6).text('Montant TTC', 450, startY + 6);
    doc.font('Helvetica').fontSize(9);
    let y = startY + 28;
    (lignes || []).forEach((l, i) => {
      if (i % 2 === 0) doc.rect(50, y - 4, 495, 18).fill('#fafafa');
      doc.text((l.libelle || '').substring(0, 42), 55, y, { width: 240 });
      doc.text(parseFloat(l.quantite || 0).toFixed(2), 300, y);
      doc.text(parseFloat(l.prix_unitaire || 0).toFixed(2), 350, y);
      doc.text(parseFloat(l.taux_tva || 0).toFixed(0) + ' %', 410, y);
      doc.text(`${parseFloat(l.montant_ttc || 0).toFixed(2)} ${devise}`, 450, y);
      y += 18;
    });
    y += 14;
    doc.rect(50, y, 495, 60).fillAndStroke('#f9f9f9', '#ddd');
    doc.font('Helvetica-Bold').text('Total HT:', 320, y + 12);
    doc.text(`${totalHT.toFixed(2)} ${devise}`, 450, y + 12);
    doc.text('TVA:', 320, y + 28);
    doc.text(`${totalTVA.toFixed(2)} ${devise}`, 450, y + 28);
    doc.fontSize(11).text('Total TTC:', 320, y + 46);
    doc.text(`${totalTTC.toFixed(2)} ${devise}`, 450, y + 46);
    doc.fontSize(8).font('Helvetica').fillColor('#666').text(`Échéance: ${facture.date_echeance ? this.formatDate(facture.date_echeance) : '—'}  |  Statut: ${facture.statut || 'brouillon'}`, 50, 800);
  }

  _factureModern(doc, facture, lignes, devise, totalHT, totalTVA, totalTTC) {
    const accent = '#2563eb';
    doc.rect(0, 0, 595, 80).fill(accent);
    doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text('FACTURE', 50, 32);
    doc.fontSize(11).font('Helvetica').text(facture.numero, 50, 55);
    doc.fontSize(10).text(`Date: ${this.formatDate(facture.date_facture)}`, 400, 35);
    if (facture.date_echeance) doc.text(`Échéance: ${this.formatDate(facture.date_echeance)}`, 400, 50);
    doc.fillColor('black').moveDown(3);
    doc.font('Helvetica-Bold').fontSize(11).text('Facturé à', 50, doc.y);
    doc.font('Helvetica').fontSize(10);
    doc.text(facture.client_nom || '', 50, doc.y + 14);
    if (facture.client_adresse) doc.text(facture.client_adresse, 50, doc.y + 28);
    if (facture.client_email) doc.text(facture.client_email, 50, doc.y + 42);
    if (facture.client_telephone) doc.text(facture.client_telephone, 50, doc.y + 56);
    doc.moveDown(1.5);
    const startY = doc.y;
    doc.moveTo(50, startY).lineTo(545, startY).stroke();
    doc.font('Helvetica-Bold').fontSize(9);
    doc.fillColor(accent);
    doc.text('Désignation', 55, startY + 10).text('Qté', 320, startY + 10).text('P.U', 370, startY + 10).text('TVA %', 420, startY + 10).text('TTC', 480, startY + 10);
    doc.fillColor('black').font('Helvetica').fontSize(9);
    let y = startY + 26;
    (lignes || []).forEach((l, i) => {
      if (i % 2 === 1) doc.rect(50, y - 6, 495, 20).fill('#f8fafc');
      doc.text((l.libelle || '').substring(0, 48), 55, y, { width: 258 });
      doc.text(parseFloat(l.quantite || 0).toFixed(2), 320, y);
      doc.text(parseFloat(l.prix_unitaire || 0).toFixed(2), 370, y);
      doc.text(parseFloat(l.taux_tva || 0).toFixed(0) + ' %', 420, y);
      doc.text(`${parseFloat(l.montant_ttc || 0).toFixed(2)} ${devise}`, 470, y);
      y += 20;
    });
    y += 12;
    doc.moveTo(350, y).lineTo(545, y).stroke();
    y += 14;
    doc.font('Helvetica').text('Total HT', 350, y);
    doc.text(`${totalHT.toFixed(2)} ${devise}`, 470, y);
    y += 16;
    doc.text('TVA', 350, y);
    doc.text(`${totalTVA.toFixed(2)} ${devise}`, 470, y);
    y += 18;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent);
    doc.text('Total TTC', 350, y);
    doc.text(`${totalTTC.toFixed(2)} ${devise}`, 470, y);
    doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(`Statut: ${facture.statut || 'brouillon'}`, 50, 800);
  }
}

module.exports = new PDFService();
