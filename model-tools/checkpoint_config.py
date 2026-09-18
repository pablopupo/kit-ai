"""Strict normalization for this Llama checkpoint; never changes model weights."""
from copy import deepcopy


def normalize_config(source):
    config = deepcopy(source)
    if config.get("model_type") != "llama":
        raise ValueError("Only the audited Llama architecture is supported")
    rope = config.pop("rope_parameters", None)
    if rope:
        if rope.get("rope_type") != "llama3":
            raise ValueError("Expected Llama 3 rotary scaling")
        theta = rope.get("rope_theta")
        if not isinstance(theta, (int, float)) or theta <= 0:
            raise ValueError("Missing or invalid rope_theta")
        scaling = {k: v for k, v in rope.items() if k != "rope_theta"}
        required = {"factor", "high_freq_factor", "low_freq_factor", "original_max_position_embeddings", "rope_type"}
        if not required.issubset(scaling):
            raise ValueError("Incomplete Llama 3 rotary scaling")
        if "rope_theta" in config and config["rope_theta"] != theta:
            raise ValueError("Conflicting rope_theta values")
        if "rope_scaling" in config and config["rope_scaling"] != scaling:
            raise ValueError("Conflicting rope_scaling values")
        config.update(rope_theta=theta, rope_scaling=scaling)
    elif config.get("rope_scaling", {}).get("rope_type") != "llama3":
        raise ValueError("Missing Llama 3 rotary scaling")
    # Only call this after the tensors have actually been dequantized.
    config.pop("quantization_config", None)
    config["dtype"] = "float16"
    config["torch_dtype"] = "float16"
    return config


def expected_shapes(config):
    hidden = config["hidden_size"]
    head = config.get("head_dim", hidden // config["num_attention_heads"])
    qdim = config["num_attention_heads"] * head
    kvdim = config["num_key_value_heads"] * head
    inner = config["intermediate_size"]
    shapes = {"model.embed_tokens.weight": (config["vocab_size"], hidden), "model.norm.weight": (hidden,)}
    for i in range(config["num_hidden_layers"]):
        prefix = f"model.layers.{i}."
        shapes.update({prefix + name: shape for name, shape in {
            "self_attn.q_proj.weight": (qdim, hidden),
            "self_attn.k_proj.weight": (kvdim, hidden),
            "self_attn.v_proj.weight": (kvdim, hidden),
            "self_attn.o_proj.weight": (hidden, qdim),
            "mlp.gate_proj.weight": (inner, hidden),
            "mlp.up_proj.weight": (inner, hidden),
            "mlp.down_proj.weight": (hidden, inner),
            "input_layernorm.weight": (hidden,),
            "post_attention_layernorm.weight": (hidden,),
        }.items()})
    if not config.get("tie_word_embeddings"):
        shapes["lm_head.weight"] = (config["vocab_size"], hidden)
    return shapes


def validate_shapes(shapes, config):
    expected = expected_shapes(config)
    for name, shape in expected.items():
        if name not in shapes or tuple(shapes[name]) != shape:
            raise ValueError(f"Invalid tensor {name}: expected {shape}, got {shapes.get(name)}")
    optional = {"lm_head.weight"} if config.get("tie_word_embeddings") else set()
    unexpected = set(shapes) - set(expected) - optional
    if unexpected:
        raise ValueError(f"Unexpected tensors: {sorted(unexpected)[:5]}")
    if "lm_head.weight" in shapes and tuple(shapes["lm_head.weight"]) != (config["vocab_size"], config["hidden_size"]):
        raise ValueError("Invalid output head shape")
    return len(shapes)
