import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  LoaderCircle,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatRupiah,
  toDateInput,
} from "@/lib/format";
import {
  MAX_SALES_TRANSACTION_ITEMS,
  MAX_SALES_TRANSACTION_NOTES_LENGTH,
  MAX_SALES_TRANSACTION_QUANTITY,
  MAX_SALES_TRANSACTION_UNIT_PRICE,
  buildCreateTransactionPayload,
  buildUpdateTransactionPayload,
  calculateLineSubtotal,
  calculateTotalQuantity,
  calculateTransactionTotal,
  type CreateSalesTransactionInput,
  type SalesProductOption,
  type SalesTransaction,
  type SalesTransactionFormItem,
  type UpdateSalesTransactionInput,
} from "@/lib/salesTransactions";

export type SalesTransactionFormMode =
  | "create"
  | "edit";

export type SalesTransactionFormSubmitInput =
  | CreateSalesTransactionInput
  | UpdateSalesTransactionInput;

export interface SalesTransactionFormProps {
  mode: SalesTransactionFormMode;

  products: readonly SalesProductOption[];

  transaction?: SalesTransaction | null;

  isSubmitting?: boolean;

  onSubmit: (
    input: SalesTransactionFormSubmitInput,
  ) => Promise<void> | void;

  onCancel?: () => void;
}

interface DraftSalesItem {
  key: string;

  productId: string;

  quantityText: string;
  unitPriceText: string;

  notes: string;

  fallbackProductName: string | null;
  fallbackProductSku: string | null;

  fallbackCategoryName: string | null;
  fallbackSubunitName: string | null;

  fallbackUnit: string | null;
}

interface ProductGroup {
  subunitId: string;
  subunitName: string;
  products: SalesProductOption[];
}

interface InitialFormState {
  transactionDate: string;
  notes: string;
  items: DraftSalesItem[];
}

export function SalesTransactionForm({
  mode,
  products,
  transaction = null,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: SalesTransactionFormProps) {
  const initialState = useMemo(
    () =>
      createInitialFormState(
        mode,
        transaction,
      ),
    [
      mode,
      transaction,
    ],
  );

  const [
    transactionDate,
    setTransactionDate,
  ] = useState(
    initialState.transactionDate,
  );

  const [
    notes,
    setNotes,
  ] = useState(
    initialState.notes,
  );

  const [
    items,
    setItems,
  ] = useState<DraftSalesItem[]>(
    initialState.items,
  );

  const [
    formError,
    setFormError,
  ] = useState<string | null>(
    null,
  );

  const [
    localSubmitting,
    setLocalSubmitting,
  ] = useState(false);

  const nextDraftId =
    useRef(
      initialState.items.length + 1,
    );

  // ==========================================================
  // RESET CREATE / EDIT STATE
  //
  // Manager nantinya dapat memakai component yang sama untuk:
  //
  // - transaksi baru
  // - edit transaksi existing
  //
  // Ketika target transaksi berubah, draft harus mengikuti
  // transaction terbaru.
  // ==========================================================

  useEffect(() => {
    setTransactionDate(
      initialState.transactionDate,
    );

    setNotes(
      initialState.notes,
    );

    setItems(
      initialState.items,
    );

    setFormError(null);

    nextDraftId.current =
      initialState.items.length + 1;
  }, [initialState]);

  // ==========================================================
  // PRODUCT LOOKUPS
  // ==========================================================

  const productMap = useMemo(
    () =>
      new Map(
        products.map((product) => [
          product.productId,
          product,
        ]),
      ),
    [products],
  );

  const productGroups =
    useMemo<ProductGroup[]>(() => {
      const groups = new Map<
        string,
        ProductGroup
      >();

      for (const product of products) {
        const current =
          groups.get(
            product.subunitId,
          );

        if (current) {
          current.products.push(
            product,
          );

          continue;
        }

        groups.set(
          product.subunitId,
          {
            subunitId:
              product.subunitId,

            subunitName:
              product.subunitName,

            products: [
              product,
            ],
          },
        );
      }

      return Array.from(
        groups.values(),
      );
    }, [products]);

  // ==========================================================
  // PREVIEW TOTALS
  //
  // Nilai invalid/blank hanya dianggap 0 untuk PREVIEW.
  //
  // Saat submit tetap melalui validation strict.
  // ==========================================================

  const previewMoneyItems =
    useMemo(
      () =>
        items.map((item) => ({
          quantity:
            parsePreviewNumber(
              item.quantityText,
            ),

          unitPrice:
            parsePreviewNumber(
              item.unitPriceText,
            ),
        })),
      [items],
    );

  const totalQuantity =
    useMemo(
      () =>
        calculateTotalQuantity(
          previewMoneyItems,
        ),
      [previewMoneyItems],
    );

  const totalAmount =
    useMemo(
      () =>
        calculateTransactionTotal(
          previewMoneyItems,
        ),
      [previewMoneyItems],
    );

  const isBusy =
    isSubmitting ||
    localSubmitting;

  const canAddItem =
    items.length <
    MAX_SALES_TRANSACTION_ITEMS;

  // ==========================================================
  // PRODUCT CHANGE
  // ==========================================================

  const handleProductChange = (
    itemKey: string,
    productId: string,
  ) => {
    const product =
      productMap.get(
        productId,
      );

    if (!product) {
      return;
    }

    setFormError(null);

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === itemKey
          ? {
              ...item,

              productId:
                product.productId,

              unitPriceText:
                String(
                  product.sellingPrice,
                ),

              fallbackProductName:
                null,

              fallbackProductSku:
                null,

              fallbackCategoryName:
                null,

              fallbackSubunitName:
                null,

              fallbackUnit:
                null,
            }
          : item,
      ),
    );
  };

  // ==========================================================
  // QUANTITY
  // ==========================================================

  const handleQuantityChange = (
    itemKey: string,
    value: string,
  ) => {
    setFormError(null);

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              quantityText:
                value,
            }
          : item,
      ),
    );
  };

  // ==========================================================
  // UNIT PRICE
  // ==========================================================

  const handleUnitPriceChange = (
    itemKey: string,
    value: string,
  ) => {
    setFormError(null);

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              unitPriceText:
                value,
            }
          : item,
      ),
    );
  };

  // ==========================================================
  // ITEM NOTES
  // ==========================================================

  const handleItemNotesChange = (
    itemKey: string,
    value: string,
  ) => {
    setFormError(null);

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              notes:
                value,
            }
          : item,
      ),
    );
  };

  // ==========================================================
  // ADD ITEM
  // ==========================================================

  const handleAddItem = () => {
    if (!canAddItem) {
      setFormError(
        `Satu transaksi maksimal memiliki ${MAX_SALES_TRANSACTION_ITEMS} baris item.`,
      );

      return;
    }

    const key =
      `new-${nextDraftId.current}`;

    nextDraftId.current += 1;

    setFormError(null);

    setItems((currentItems) => [
      ...currentItems,
      createEmptyDraftItem(
        key,
      ),
    ]);
  };

  // ==========================================================
  // REMOVE ITEM
  //
  // Form selalu menyisakan minimal satu row supaya user tidak
  // masuk ke state cart tanpa baris input.
  // ==========================================================

  const handleRemoveItem = (
    itemKey: string,
  ) => {
    if (items.length <= 1) {
      return;
    }

    setFormError(null);

    setItems((currentItems) =>
      currentItems.filter(
        (item) =>
          item.key !== itemKey,
      ),
    );
  };

  // ==========================================================
  // SUBMIT
  // ==========================================================

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setFormError(null);

    try {
      const normalizedItems =
        normalizeDraftItems(
          items,
        );

      if (mode === "edit") {
        if (!transaction) {
          throw new Error(
            "Transaksi yang akan diedit tidak ditemukan.",
          );
        }

        const input: UpdateSalesTransactionInput =
          {
            transactionId:
              transaction.id,

            transactionDate,

            notes,

            items:
              normalizedItems,
          };

        // Validate menggunakan domain rules Stage 2D.1
        // sebelum meneruskan input ke data layer.
        buildUpdateTransactionPayload(
          input,
        );

        setLocalSubmitting(true);

        await onSubmit(
          input,
        );

        return;
      }

      const input: CreateSalesTransactionInput =
        {
          transactionDate,

          notes,

          entrySource:
            "manual",

          items:
            normalizedItems,
        };

      // Validate menggunakan domain rules Stage 2D.1.
      buildCreateTransactionPayload(
        input,
      );

      setLocalSubmitting(true);

      await onSubmit(
        input,
      );
    } catch (error) {
      setFormError(
        getErrorMessage(
          error,
        ),
      );
    } finally {
      setLocalSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit}
    >
      {/* =====================================================
          TRANSACTION HEADER
          ===================================================== */}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sales-transaction-date">
            Tanggal transaksi
          </Label>

          <Input
            id="sales-transaction-date"
            type="date"
            value={transactionDate}
            disabled={isBusy}
            onChange={(event) => {
              setFormError(null);

              setTransactionDate(
                event.target.value,
              );
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>
            Sumber transaksi
          </Label>

          <div className="flex h-9 items-center">
            <Badge variant="outline">
              {mode === "edit" &&
              transaction?.entrySource ===
                "visitor"
                ? "Pengunjung"
                : "Manual"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="sales-transaction-notes">
            Catatan transaksi
          </Label>

          <span className="text-xs text-muted-foreground">
            {notes.length}/
            {
              MAX_SALES_TRANSACTION_NOTES_LENGTH
            }
          </span>
        </div>

        <Textarea
          id="sales-transaction-notes"
          rows={3}
          maxLength={
            MAX_SALES_TRANSACTION_NOTES_LENGTH
          }
          value={notes}
          disabled={isBusy}
          placeholder="Catatan transaksi (opsional)"
          onChange={(event) => {
            setFormError(null);

            setNotes(
              event.target.value,
            );
          }}
        />
      </div>

      {/* =====================================================
          CART HEADER
          ===================================================== */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />

            <h3 className="font-semibold">
              Item transaksi
            </h3>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Produk menentukan Category dan Subunit secara otomatis.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={
            isBusy ||
            !canAddItem
          }
          onClick={handleAddItem}
        >
          <Plus className="mr-2 h-4 w-4" />
          Tambah item
        </Button>
      </div>

      {/* =====================================================
          NO ACTIVE PRODUCTS WARNING
          ===================================================== */}

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Belum ada Product aktif yang dapat digunakan untuk membuat transaksi.
          Pastikan Product, Category, dan Subunit sudah aktif.
        </div>
      ) : null}

      {/* =====================================================
          CART ROWS
          ===================================================== */}

      <div className="space-y-4">
        {items.map(
          (
            item,
            index,
          ) => {
            const selectedProduct =
              productMap.get(
                item.productId,
              );

            const productUnavailable =
              Boolean(
                item.productId,
              ) &&
              !selectedProduct;

            const subunitName =
              selectedProduct?.subunitName ??
              item.fallbackSubunitName;

            const categoryName =
              selectedProduct?.categoryName ??
              item.fallbackCategoryName;

            const unit =
              selectedProduct?.unit ??
              item.fallbackUnit;

            const fallbackProductLabel =
              buildFallbackProductLabel(
                item,
              );

            const lineSubtotal =
              calculateLineSubtotal({
                quantity:
                  parsePreviewNumber(
                    item.quantityText,
                  ),

                unitPrice:
                  parsePreviewNumber(
                    item.unitPriceText,
                  ),
              });

            return (
              <div
                key={item.key}
                className="space-y-4 rounded-lg border p-4"
              >
                {/* ROW TITLE */}

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      Item {index + 1}
                    </p>

                    {productUnavailable ? (
                      <p className="mt-1 text-xs text-destructive">
                        Product transaksi ini sudah tidak tersedia sebagai Product aktif.
                        Pilih Product aktif sebelum menyimpan perubahan.
                      </p>
                    ) : null}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus item ${index + 1}`}
                    disabled={
                      isBusy ||
                      items.length <= 1
                    }
                    onClick={() =>
                      handleRemoveItem(
                        item.key,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* MAIN ITEM FIELDS */}

                <div className="grid gap-4 lg:grid-cols-12">
                  {/* PRODUCT */}

                  <div className="space-y-2 lg:col-span-5">
                    <Label>
                      Product
                    </Label>

                    <Select
                      value={
                        item.productId ||
                        undefined
                      }
                      disabled={
                        isBusy ||
                        products.length ===
                          0
                      }
                      onValueChange={(
                        productId,
                      ) =>
                        handleProductChange(
                          item.key,
                          productId,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Product" />
                      </SelectTrigger>

                      <SelectContent className="max-h-80">
                        {productUnavailable ? (
                          <SelectGroup>
                            <SelectLabel>
                              Product sebelumnya
                            </SelectLabel>

                            <SelectItem
                              value={
                                item.productId
                              }
                              disabled
                            >
                              {fallbackProductLabel}
                            </SelectItem>
                          </SelectGroup>
                        ) : null}

                        {productGroups.map(
                          (group) => (
                            <SelectGroup
                              key={
                                group.subunitId
                              }
                            >
                              <SelectLabel>
                                {
                                  group.subunitName
                                }
                              </SelectLabel>

                              {group.products.map(
                                (
                                  product,
                                ) => (
                                  <SelectItem
                                    key={
                                      product.productId
                                    }
                                    value={
                                      product.productId
                                    }
                                  >
                                    {
                                      product.productName
                                    }
                                    {" · "}
                                    {
                                      product.categoryName
                                    }
                                  </SelectItem>
                                ),
                              )}
                            </SelectGroup>
                          ),
                        )}
                      </SelectContent>
                    </Select>

                    {/* DERIVED OWNERSHIP */}

                    {subunitName ||
                    categoryName ||
                    unit ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {subunitName ? (
                          <Badge variant="outline">
                            {subunitName}
                          </Badge>
                        ) : null}

                        {categoryName ? (
                          <Badge variant="secondary">
                            {categoryName}
                          </Badge>
                        ) : null}

                        {unit ? (
                          <span className="text-xs text-muted-foreground">
                            Unit: {unit}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Pilih Product untuk melihat Subunit dan Category.
                      </p>
                    )}
                  </div>

                  {/* QUANTITY */}

                  <div className="space-y-2 lg:col-span-2">
                    <Label
                      htmlFor={`sales-item-quantity-${item.key}`}
                    >
                      Quantity
                    </Label>

                    <Input
                      id={`sales-item-quantity-${item.key}`}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max={
                        MAX_SALES_TRANSACTION_QUANTITY
                      }
                      step="0.01"
                      value={
                        item.quantityText
                      }
                      disabled={isBusy}
                      onChange={(event) =>
                        handleQuantityChange(
                          item.key,
                          event.target.value,
                        )
                      }
                    />

                    {unit ? (
                      <p className="text-xs text-muted-foreground">
                        {unit}
                      </p>
                    ) : null}
                  </div>

                  {/* UNIT PRICE */}

                  <div className="space-y-2 lg:col-span-3">
                    <Label
                      htmlFor={`sales-item-price-${item.key}`}
                    >
                      Harga satuan
                    </Label>

                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        Rp
                      </span>

                      <Input
                        id={`sales-item-price-${item.key}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={
                          MAX_SALES_TRANSACTION_UNIT_PRICE
                        }
                        step="0.01"
                        className="pl-9"
                        value={
                          item.unitPriceText
                        }
                        disabled={isBusy}
                        onChange={(event) =>
                          handleUnitPriceChange(
                            item.key,
                            event.target.value,
                          )
                        }
                      />
                    </div>

                    {selectedProduct ? (
                      <p className="text-xs text-muted-foreground">
                        Harga master:{" "}
                        {formatRupiah(
                          selectedProduct.sellingPrice,
                        )}
                      </p>
                    ) : null}
                  </div>

                  {/* SUBTOTAL */}

                  <div className="space-y-2 lg:col-span-2">
                    <Label>
                      Subtotal
                    </Label>

                    <div className="flex min-h-9 items-center font-semibold">
                      {formatRupiah(
                        lineSubtotal,
                      )}
                    </div>
                  </div>
                </div>

                {/* ITEM NOTES */}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <Label
                      htmlFor={`sales-item-notes-${item.key}`}
                    >
                      Catatan item
                    </Label>

                    <span className="text-xs text-muted-foreground">
                      {item.notes.length}/
                      {
                        MAX_SALES_TRANSACTION_NOTES_LENGTH
                      }
                    </span>
                  </div>

                  <Input
                    id={`sales-item-notes-${item.key}`}
                    value={item.notes}
                    maxLength={
                      MAX_SALES_TRANSACTION_NOTES_LENGTH
                    }
                    disabled={isBusy}
                    placeholder="Catatan item (opsional)"
                    onChange={(event) =>
                      handleItemNotesChange(
                        item.key,
                        event.target.value,
                      )
                    }
                  />
                </div>
              </div>
            );
          },
        )}
      </div>

      {/* =====================================================
          CART LIMIT
          ===================================================== */}

      {!canAddItem ? (
        <p className="text-sm text-muted-foreground">
          Maksimal{" "}
          {
            MAX_SALES_TRANSACTION_ITEMS
          }{" "}
          baris item per transaksi.
        </p>
      ) : null}

      {/* =====================================================
          SUMMARY
          ===================================================== */}

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Total baris
          </p>

          <p className="mt-1 text-lg font-semibold">
            {items.length}
          </p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">
            Total quantity
          </p>

          <p className="mt-1 text-lg font-semibold">
            {totalQuantity}
          </p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">
            Total transaksi
          </p>

          <p className="mt-1 text-lg font-semibold">
            {formatRupiah(
              totalAmount,
            )}
          </p>
        </div>
      </div>

      {/* =====================================================
          ERROR
          ===================================================== */}

      {formError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {formError}
        </div>
      ) : null}

      {/* =====================================================
          ACTIONS
          ===================================================== */}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={onCancel}
          >
            Batal
          </Button>
        ) : null}

        <Button
          type="submit"
          disabled={
            isBusy ||
            products.length === 0
          }
        >
          {isBusy ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : null}

          {mode === "edit"
            ? "Simpan perubahan"
            : "Simpan transaksi"}
        </Button>
      </div>
    </form>
  );
}

// ============================================================
// INITIAL FORM STATE
// ============================================================

function createInitialFormState(
  mode: SalesTransactionFormMode,
  transaction: SalesTransaction | null,
): InitialFormState {
  if (
    mode === "edit" &&
    transaction
  ) {
    const transactionItems =
      transaction.items.length > 0
        ? transaction.items.map(
            (item) => ({
              key:
                `existing-${item.id}`,

              productId:
                item.productId,

              quantityText:
                String(
                  item.quantity,
                ),

              unitPriceText:
                String(
                  item.unitPrice,
                ),

              notes:
                item.notes ?? "",

              fallbackProductName:
                item.productNameSnapshot,

              fallbackProductSku:
                item.productSkuSnapshot,

              fallbackCategoryName:
                item.categoryNameSnapshot,

              fallbackSubunitName:
                item.subunitNameSnapshot,

              fallbackUnit:
                item.unitSnapshot,
            }),
          )
        : [
            createEmptyDraftItem(
              "edit-empty-1",
            ),
          ];

    return {
      transactionDate:
        transaction.transactionDate,

      notes:
        transaction.notes ?? "",

      items:
        transactionItems,
    };
  }

  return {
    transactionDate:
      toDateInput(
        new Date(),
      ),

    notes:
      "",

    items: [
      createEmptyDraftItem(
        "new-1",
      ),
    ],
  };
}

// ============================================================
// EMPTY CART ITEM
// ============================================================

function createEmptyDraftItem(
  key: string,
): DraftSalesItem {
  return {
    key,

    productId:
      "",

    quantityText:
      "1",

    unitPriceText:
      "",

    notes:
      "",

    fallbackProductName:
      null,

    fallbackProductSku:
      null,

    fallbackCategoryName:
      null,

    fallbackSubunitName:
      null,

    fallbackUnit:
      null,
  };
}

// ============================================================
// NORMALIZE FORM CART
//
// Numeric input sengaja disimpan sebagai STRING saat user
// mengetik agar state seperti:
//
// ""
// "0"
// "1.5"
//
// tetap bisa direpresentasikan secara benar.
//
// Baru pada submit dikonversi ke number.
// ============================================================

function normalizeDraftItems(
  items: readonly DraftSalesItem[],
): SalesTransactionFormItem[] {
  return items.map(
    (
      item,
      index,
    ) => {
      const lineNumber =
        index + 1;

      if (
        !item.productId.trim()
      ) {
        throw new Error(
          `Product pada baris ${lineNumber} wajib dipilih.`,
        );
      }

      const quantity =
        parseRequiredDraftNumber(
          item.quantityText,
          `Quantity pada baris ${lineNumber}`,
        );

      const unitPrice =
        parseRequiredDraftNumber(
          item.unitPriceText,
          `Harga satuan pada baris ${lineNumber}`,
        );

      return {
        productId:
          item.productId,

        quantity,

        unitPrice,

        notes:
          item.notes,
      };
    },
  );
}

// ============================================================
// STRICT NUMBER PARSER
//
// Empty price TIDAK dianggap 0.
//
// Ini penting karena harga 0 memang legal, tetapi user harus
// benar-benar memasukkan angka 0 bila transaksi gratis.
// ============================================================

function parseRequiredDraftNumber(
  value: string,
  fieldName: string,
): number {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} wajib diisi.`,
    );
  }

  const numericValue =
    Number(normalized);

  if (
    !Number.isFinite(
      numericValue,
    )
  ) {
    throw new Error(
      `${fieldName} tidak valid.`,
    );
  }

  return numericValue;
}

// ============================================================
// PREVIEW NUMBER PARSER
//
// Hanya untuk menampilkan subtotal/summary.
// Invalid/blank -> 0.
//
// Validation submit tetap strict.
// ============================================================

function parsePreviewNumber(
  value: string,
): number {
  const normalized =
    value.trim();

  if (!normalized) {
    return 0;
  }

  const numericValue =
    Number(normalized);

  return Number.isFinite(
    numericValue,
  )
    ? numericValue
    : 0;
}

// ============================================================
// HISTORICAL PRODUCT LABEL
//
// Edit transaksi bisa dibuka setelah Product aslinya tidak
// lagi aktif.
//
// Snapshot tetap ditampilkan agar histori tidak kehilangan
// konteks, tetapi user harus memilih Product aktif sebelum
// update dapat disimpan.
// ============================================================

function buildFallbackProductLabel(
  item: DraftSalesItem,
): string {
  const name =
    item.fallbackProductName ??
    "Product lama";

  const sku =
    item.fallbackProductSku?.trim();

  return sku
    ? `${name} (${sku}) — tidak aktif`
    : `${name} — tidak aktif`;
}

// ============================================================
// ERROR MESSAGE
// ============================================================

function getErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message ===
      "string"
  ) {
    return error.message;
  }

  return "Terjadi kesalahan saat menyimpan transaksi.";
}