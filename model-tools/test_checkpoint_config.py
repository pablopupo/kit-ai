import copy
import unittest
from checkpoint_config import expected_shapes, normalize_config, validate_shapes

FIXTURE = {
    "model_type": "llama", "hidden_size": 3072, "intermediate_size": 8192,
    "num_attention_heads": 24, "num_key_value_heads": 8, "num_hidden_layers": 28,
    "head_dim": 128, "vocab_size": 128256, "tie_word_embeddings": True,
    "rope_parameters": {"rope_theta": 500000.0, "rope_type": "llama3", "factor": 32,
        "high_freq_factor": 4, "low_freq_factor": 1, "original_max_position_embeddings": 8192},
    "quantization_config": {"quant_method": "bitsandbytes"},
}


class CheckpointTests(unittest.TestCase):
    def test_rope_values_preserved_and_source_unchanged(self):
        source = copy.deepcopy(FIXTURE)
        result = normalize_config(source)
        self.assertEqual(source, FIXTURE)
        self.assertEqual(result["rope_theta"], 500000)
        self.assertEqual(result["rope_scaling"], {k: v for k, v in source["rope_parameters"].items() if k != "rope_theta"})
        self.assertNotIn("quantization_config", result)
        self.assertNotIn("rope_parameters", result)
        self.assertEqual(normalize_config(result), result)

    def test_conflicting_or_missing_rotary_settings_rejected(self):
        conflict = dict(FIXTURE, rope_theta=10000)
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            normalize_config(conflict)
        bad = copy.deepcopy(FIXTURE)
        del bad["rope_parameters"]["high_freq_factor"]
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            normalize_config(bad)

    def test_expected_gqa_shapes_and_missing_layer_rejected(self):
        shapes = expected_shapes(FIXTURE)
        self.assertEqual(shapes["model.layers.0.self_attn.q_proj.weight"], (3072, 3072))
        self.assertEqual(shapes["model.layers.0.self_attn.k_proj.weight"], (1024, 3072))
        self.assertEqual(validate_shapes(shapes, FIXTURE), 254)
        del shapes["model.layers.27.mlp.down_proj.weight"]
        with self.assertRaisesRegex(ValueError, "Invalid tensor"):
            validate_shapes(shapes, FIXTURE)

    def test_packed_nf4_and_metadata_cannot_pass_as_float_export(self):
        shapes = expected_shapes(FIXTURE)
        shapes["model.layers.0.self_attn.q_proj.weight"] = (4718592, 1)
        with self.assertRaisesRegex(ValueError, "Invalid tensor"):
            validate_shapes(shapes, FIXTURE)
        shapes = expected_shapes(FIXTURE)
        shapes["model.layers.0.self_attn.q_proj.weight.absmax"] = (1,)
        with self.assertRaisesRegex(ValueError, "Unexpected tensors"):
            validate_shapes(shapes, FIXTURE)


if __name__ == "__main__":
    unittest.main()
