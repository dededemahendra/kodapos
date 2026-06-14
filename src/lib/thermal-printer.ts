// WebUSB transport for an ESC/POS thermal printer. Browser-only (Chromium
// desktop + Android Chrome); not available in Safari/Firefox. Pairing the device
// requires a user gesture (navigator.usb.requestDevice), after which the device
// id is remembered in localStorage and re-resolved from getDevices(). All calls
// are defensive and throw clear, user-facing errors the UI can toast.

// Minimal WebUSB types (avoids adding @types/w3c-web-usb).
interface UsbEndpoint {
  endpointNumber: number;
  direction: 'in' | 'out';
}
interface UsbAlternate {
  endpoints: UsbEndpoint[];
}
interface UsbInterface {
  interfaceNumber: number;
  alternate: UsbAlternate;
}
interface UsbConfiguration {
  interfaces: UsbInterface[];
}
interface UsbDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  configuration: UsbConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<unknown>;
}
interface Usb {
  requestDevice(options: { filters: Array<Record<string, number>> }): Promise<UsbDevice>;
  getDevices(): Promise<UsbDevice[]>;
}

const VENDOR_KEY = 'kodapos.printerVendorId';
const PRODUCT_KEY = 'kodapos.printerProductId';
const NAME_KEY = 'kodapos.printerName';

export interface PrinterInfo {
  vendorId: number;
  productId: number;
  name: string;
}

function getUsb(): Usb | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as unknown as { usb?: Usb }).usb ?? null;
}

/** Whether this browser supports WebUSB (and so direct thermal printing). */
export function isThermalSupported(): boolean {
  return getUsb() !== null;
}

/** The paired printer remembered in localStorage, or null. */
export function getSavedPrinterInfo(): PrinterInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(VENDOR_KEY);
    const pr = window.localStorage.getItem(PRODUCT_KEY);
    if (v === null || pr === null) return null;
    return {
      vendorId: Number(v),
      productId: Number(pr),
      name: window.localStorage.getItem(NAME_KEY) ?? 'USB printer',
    };
  } catch {
    return null;
  }
}

function savePrinterInfo(info: PrinterInfo): void {
  try {
    window.localStorage.setItem(VENDOR_KEY, String(info.vendorId));
    window.localStorage.setItem(PRODUCT_KEY, String(info.productId));
    window.localStorage.setItem(NAME_KEY, info.name);
  } catch {
    /* ignore */
  }
}

export function clearSavedPrinter(): void {
  try {
    window.localStorage.removeItem(VENDOR_KEY);
    window.localStorage.removeItem(PRODUCT_KEY);
    window.localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}

/** Prompts the user to pick a USB printer (must run from a user gesture). */
export async function requestThermalPrinter(): Promise<PrinterInfo> {
  const usb = getUsb();
  if (!usb) throw new Error('Browser ini tidak mendukung WebUSB.');
  // Empty filter list shows all USB devices so any printer can be selected,
  // regardless of whether it advertises the printer device class.
  const device = await usb.requestDevice({ filters: [] });
  const info: PrinterInfo = {
    vendorId: device.vendorId,
    productId: device.productId,
    name: device.productName ?? 'USB printer',
  };
  savePrinterInfo(info);
  return info;
}

async function resolveDevice(): Promise<UsbDevice> {
  const usb = getUsb();
  if (!usb) throw new Error('Browser ini tidak mendukung WebUSB.');
  const info = getSavedPrinterInfo();
  if (!info) throw new Error('Printer termal belum dipasangkan.');
  const devices = await usb.getDevices();
  const device = devices.find(
    (d) => d.vendorId === info.vendorId && d.productId === info.productId
  );
  if (!device) throw new Error('Printer tidak ditemukan. Hubungkan kembali di Pengaturan.');
  return device;
}

function findOutEndpoint(
  device: UsbDevice
): { interfaceNumber: number; endpointNumber: number } | null {
  for (const intf of device.configuration?.interfaces ?? []) {
    const ep = intf.alternate.endpoints.find((e) => e.direction === 'out');
    if (ep) return { interfaceNumber: intf.interfaceNumber, endpointNumber: ep.endpointNumber };
  }
  return null;
}

/** Sends raw ESC/POS bytes to the paired printer. */
export async function printBytes(bytes: Uint8Array): Promise<void> {
  const device = await resolveDevice();
  await device.open();
  let claimed: number | null = null;
  try {
    if (!device.configuration) await device.selectConfiguration(1);
    const target = findOutEndpoint(device);
    if (!target) throw new Error('Printer tidak punya endpoint keluaran yang didukung.');
    await device.claimInterface(target.interfaceNumber);
    claimed = target.interfaceNumber;
    await device.transferOut(target.endpointNumber, bytes);
  } finally {
    try {
      if (claimed !== null) await device.releaseInterface(claimed);
      await device.close();
    } catch {
      /* ignore release/close errors */
    }
  }
}
