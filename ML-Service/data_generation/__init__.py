"""Synthetic data generation for the PayZo ML training pipeline.

Produces entity-shaped parquet files that mirror the Spring Boot domain model
(User/Client, Transaction, CbsAccount, FraudAlert, Bank) so the same downstream
feature pipeline works when real production data eventually replaces these
synthetic rows.
"""
