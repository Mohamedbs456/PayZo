package com.payzo.backend.dto.response.analyst;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MlMetricsResponse {

    private double accuracy;
    private double precision;
    private double recall;
    private double f1;
    private double aucRoc;
    private double aucPr;
    /**
     * 2×2 confusion matrix as returned by the Python ML service:
     * {@code [[TN, FP], [FN, TP]]}. Stored as nested lists rather than a
     * keyed map because that's the ML service's canonical shape and the FE
     * can index it positionally without an enum.
     */
    private List<List<Integer>> confusionMatrix;
    private Map<String, Double> featureImportances;
}
