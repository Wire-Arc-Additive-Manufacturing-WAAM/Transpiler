import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';

export interface ContractPdfPayload {
  publicId: string;
  agreedPrice: number;
  depositPercent: number;
  depositAmount: number;
  balanceAmount: number;
  cargoDescription: string;
  pickupAt: Date;
  deliveryEta: Date;
  cancellationTerms: string;
  pickupAddress: string;
  destinationAddress: string;
  signedAt?: Date | null;
}

@Injectable()
export class PdfService {
  async renderContractPdf(payload: ContractPdfPayload): Promise<string> {
    const dir = path.join(process.cwd(), 'storage', 'contracts');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${payload.publicId}.pdf`;
    const filepath = path.join(dir, filename);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      doc.fontSize(20).text('Nibebee — Transport e-Contract', { underline: true });
      doc.moveDown();
      doc.fontSize(10).text(`Contract ID: ${payload.publicId}`);
      if (payload.signedAt) {
        doc.text(`Signed at (EAT): ${payload.signedAt.toISOString()}`);
      }
      doc.moveDown();
      doc.fontSize(12).text(`Agreed price: ${payload.agreedPrice}`);
      doc.text(
        `Deposit (${payload.depositPercent}%): ${payload.depositAmount} | Balance: ${payload.balanceAmount}`,
      );
      doc.moveDown().text('Cargo:', { continued: false });
      doc.fontSize(10).text(payload.cargoDescription);
      doc.moveDown().text(`Pickup: ${payload.pickupAt.toISOString()}`);
      doc.text(`ETA delivery: ${payload.deliveryEta.toISOString()}`);
      doc.moveDown().text(`Pickup address: ${payload.pickupAddress}`);
      doc.text(`Destination: ${payload.destinationAddress}`);
      doc.moveDown().text('Cancellation / penalties:', { underline: true });
      doc.text(payload.cancellationTerms);
      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return `/storage/contracts/${filename}`;
  }
}
