import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Image,
  FlatList,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SQLite from 'expo-sqlite';


// Stałe konfiguracyjne
const OFF_API_URL = 'https://world.openfoodfacts.org/api/v2/product';
const HISTORY_LIMIT = 20;


// Warstwa dostępu do lokalnej bazy danych (historia wyszukań)
function useHistoryDb() {
  const [db, setDb] = useState(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const database = await SQLite.openDatabaseAsync('food_scanner.db');
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          barcode TEXT NOT NULL,
          name TEXT,
          brand TEXT,
          grade TEXT,
          image_url TEXT,
          scanned_at TEXT NOT NULL
        );
      `);
      if (isMounted) setDb(database);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const addEntry = useCallback(
    async (entry) => {
      if (!db) return;
      await db.runAsync(
        'INSERT INTO history (barcode, name, brand, grade, image_url, scanned_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          entry.barcode,
          entry.name ?? null,
          entry.brand ?? null,
          entry.grade ?? null,
          entry.imageUrl ?? null,
          new Date().toISOString(),
        ]
      );
    },
    [db]
  );

  const getHistory = useCallback(async () => {
    if (!db) return [];
    return db.getAllAsync(
      'SELECT * FROM history ORDER BY id DESC LIMIT ?',
      [HISTORY_LIMIT]
    );
  }, [db]);

  return { ready: !!db, addEntry, getHistory };
}
// Zapytanie do Open Food Facts
async function fetchProductByBarcode(barcode) {
  const response = await fetch(`${OFF_API_URL}/${barcode}.json`);

  if (!response.ok) {
    throw new Error(`Błąd serwera (HTTP ${response.status})`);
  }

  const data = await response.json();

  // Open Food Facts zwraca status: 0 gdy produkt nie istnieje w bazie
  if (data.status !== 1 || !data.product) {
    return null;
  }

  const p = data.product;
  return {
    barcode,
    name: p.product_name || p.product_name_pl || 'Brak nazwy produktu',
    brand: p.brands || 'Nieznana marka',
    category: p.categories || 'Brak danych o kategorii',
    grade: (p.nutriscore_grade || '').toUpperCase() || null,
    imageUrl: p.image_front_small_url || p.image_url || null,
  };
}


// Komponent: wynik skanowania

function ProductResult({ product, onScanAgain }) {
  return (
    <View style={styles.resultCard}>
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>Brak zdjęcia</Text>
        </View>
      )}
      <Text style={styles.productName}>{product.name}</Text>
      <Text style={styles.productMeta}>Marka: {product.brand}</Text>
      <Text style={styles.productMeta}>Kategoria: {product.category}</Text>
      {product.grade && (
        <View style={[styles.gradeBadge, gradeColor(product.grade)]}>
          <Text style={styles.gradeText}>Nutri-Score: {product.grade}</Text>
        </View>
      )}
      <Text style={styles.productMeta}>Kod kreskowy: {product.barcode}</Text>

      <Pressable style={styles.button} onPress={onScanAgain}>
        <Text style={styles.buttonText}>Skanuj ponownie</Text>
      </Pressable>
    </View>
  );
}

function gradeColor(grade) {
  switch (grade) {
    case 'A':
      return { backgroundColor: '#2e7d32' };
    case 'B':
      return { backgroundColor: '#66bb6a' };
    case 'C':
      return { backgroundColor: '#fbc02d' };
    case 'D':
      return { backgroundColor: '#ef6c00' };
    case 'E':
      return { backgroundColor: '#c62828' };
    default:
      return { backgroundColor: '#9e9e9e' };
  }
}


// Komponent: historia ostatnich wyszukań
function HistoryList({ items }) {
  if (!items.length) {
    return <Text style={styles.historyEmpty}>Brak historii skanowań.</Text>;
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      style={styles.historyList}
      renderItem={({ item }) => (
        <View style={styles.historyRow}>
          <Text style={styles.historyName} numberOfLines={1}>
            {item.name || 'Nieznany produkt'}
          </Text>
          <Text style={styles.historyBarcode}>{item.barcode}</Text>
        </View>
      )}
    />
  );
}


// Główny komponent aplikacji
export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [product, setProduct] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  const { ready: dbReady, addEntry, getHistory } = useHistoryDb();

  const refreshHistory = useCallback(async () => {
    const rows = await getHistory();
    setHistory(rows);
  }, [getHistory]);

  useEffect(() => {
    if (dbReady) refreshHistory();
  }, [dbReady, refreshHistory]);

  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (scanned) return; // zabezpieczenie przed wielokrotnym odczytem
      setScanned(true);
      setLoading(true);
      setError(null);
      setProduct(null);

      try {
        const result = await fetchProductByBarcode(data);
        if (!result) {
          setError('Produkt o tym kodzie nie istnieje w bazie Open Food Facts.');
        } else {
          setProduct(result);
          if (dbReady) {
            await addEntry(result);
            refreshHistory();
          }
        }
      } catch (err) {
        setError(
          err.message === 'Network request failed'
            ? 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'
            : `Wystąpił błąd: ${err.message}`
        );
      } finally {
        setLoading(false);
      }
    },
    [scanned, dbReady, addEntry, refreshHistory]
  );

  const resetScanner = () => {
    setScanned(false);
    setProduct(null);
    setError(null);
  };

  // Stan: uprawnienia jeszcze się ładują 
  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  // Stan: brak zgody użytkownika na kamerę 
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionText}>
          Aplikacja potrzebuje dostępu do aparatu, aby skanować kody kreskowe.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Udziel zgody</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Skaner produktów spożywczych</Text>
        <Pressable onPress={() => setShowHistory((v) => !v)}>
          <Text style={styles.headerLink}>
            {showHistory ? 'Zamknij historię' : 'Historia'}
          </Text>
        </Pressable>
      </View>

      {showHistory ? (
        <HistoryList items={history} />
      ) : (
        <>
          {!scanned && (
            <View style={styles.cameraWrapper}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                barcodeScannerSettings={{
                  barcodeTypes: [
                    'ean13',
                    'ean8',
                    'upc_a',
                    'upc_e',
                    'code128',
                    'code39',
                  ],
                }}
                onBarcodeScanned={handleBarcodeScanned}
              />
              <View style={styles.scanFrame} />
              <Text style={styles.scanHint}>
                Wyceluj aparat w kod kreskowy produktu
              </Text>
            </View>
          )}

          {loading && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#2e7d32" />
              <Text style={styles.loadingText}>Wyszukiwanie produktu…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.button} onPress={resetScanner}>
                <Text style={styles.buttonText}>Skanuj ponownie</Text>
              </Pressable>
            </View>
          )}

          {!loading && product && (
            <ProductResult product={product} onScanAgain={resetScanner} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

// Style
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101418',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#101418',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#232a31',
  },
  headerTitle: {
    color: '#f5f5f5',
    fontSize: 18,
    fontWeight: '700',
  },
  headerLink: {
    color: '#66bb6a',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  scanFrame: {
    position: 'absolute',
    top: '30%',
    left: '15%',
    width: '70%',
    height: '25%',
    borderWidth: 3,
    borderColor: '#66bb6a',
    borderRadius: 12,
  },
  scanHint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 13,
  },
  loadingText: {
    marginTop: 12,
    color: '#cfd8dc',
    fontSize: 14,
  },
  permissionText: {
    color: '#f5f5f5',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#ef5350',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  resultCard: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  productImage: {
    width: 140,
    height: 140,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#1c2329',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    color: '#78909c',
    fontSize: 12,
  },
  productName: {
    color: '#f5f5f5',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  productMeta: {
    color: '#b0bec5',
    fontSize: 14,
    marginBottom: 4,
    textAlign: 'center',
  },
  gradeBadge: {
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  gradeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  button: {
    marginTop: 20,
    backgroundColor: '#2e7d32',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  historyList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  historyEmpty: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#78909c',
    marginTop: 40,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#232a31',
  },
  historyName: {
    color: '#eceff1',
    fontSize: 14,
    flexShrink: 1,
    marginRight: 12,
  },
  historyBarcode: {
    color: '#78909c',
    fontSize: 13,
  },
});
