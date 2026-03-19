$path = 'src\app\admin\properties\page.tsx'
$text = Get-Content -Raw $path
if ($text -match 'Save & Create Invoice') { exit 0 }
$marker = "                                  </ul>`r`n                                )}`r`n                              </td>"
if (-not $text.Contains($marker)) { Write-Error 'Marker not found'; exit 1 }
$lines = @(
"                                {p.unitTypes.some((u) => u.managementType === \"FullManagement\") ? (",
"                                  <div className=\"mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4\">",
"                                    <div className=\"flex flex-col sm:flex-row sm:items-end gap-3\">",
"                                      <div className=\"flex-1\">",
"                                        <label className=\"block text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-2\">",
"                                          Full Management Fee (% of expected income)",
"                                        </label>",
"                                        <input",
"                                          type=\"number\"",
"                                          min=\"0\"",
"                                          max=\"100\"",
"                                          step=\"0.01\"",
"                                          value={feeInputs[p._id] ?? (p.managementFeePercent?.toString() ?? \"\")}",
"                                          onChange={(e) =>",
"                                            setFeeInputs({ ...feeInputs, [p._id]: e.target.value })",
"                                          }",
"                                          className=\"w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200\"",
"                                        />",
"                                        <p className=\"mt-2 text-xs text-emerald-800/80\">",
"                                          Creates a monthly invoice based on expected income for this property.",
"                                        </p>",
"                                      </div>",
"                                      <button",
"                                        onClick={() => handleSetManagementFee(p)}",
"                                        disabled={feeLoadingId === p._id}",
"                                        className=\"rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50\"",
"                                      >",
"                                        {feeLoadingId === p._id ? \"Saving...\" : \"Save & Create Invoice\"}",
"                                      </button>",
"                                    </div>",
"                                  </div>",
"                                ) : (
"                                  <p className=\"mt-4 text-xs text-gray-500\">",
"                                    Software leasing invoices are 3% of expected monthly income and are auto-generated when tenants are added.",
"                                  </p>",
"                                )}"
)
$block = $lines -join "`r`n"
$replacement = "                                  </ul>`r`n                                )}`r`n`r`n" + $block + "`r`n                              </td>"
$text = $text.Replace($marker, $replacement)
Set-Content -Path $path -Value $text
