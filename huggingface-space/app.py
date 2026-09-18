"""GPU inference service for KIT AI's published medical model."""

# Import spaces before torch so ZeroGPU can install its CUDA integration.
import spaces
import torch
import gradio as gr
from transformers import AutoTokenizer, AutoModelForCausalLM

from prompting import build_messages, finish_response, validate_generation_options

REPO_ID = "Pablo305/llama3-medical-3b-4bit"
MODEL_REVISION = "df5aa311d5b017bdd4d1719c50c5d7a1dd1fa37b"
MAX_INPUT_TOKENS = 4096

# ZeroGPU optimizes model placement during startup, outside the decorated function.
# The saved checkpoint already contains its bitsandbytes NF4 configuration.
tokenizer = AutoTokenizer.from_pretrained(REPO_ID, revision=MODEL_REVISION)
model = AutoModelForCausalLM.from_pretrained(
    REPO_ID,
    revision=MODEL_REVISION,
    device_map={"": "cuda:0"},
    dtype=torch.float16,
)
model.eval()


@spaces.GPU(duration=60)
def ask(question: str, n: int = 6, max_tokens: int = 512) -> str:
    """Answer a first-aid question without silently removing generated steps."""
    try:
        n, max_tokens = validate_generation_options(n, max_tokens)
        messages = build_messages(question, n)
    except ValueError as error:
        raise gr.Error(str(error)) from error

    inputs = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    )
    input_len = inputs["input_ids"].shape[1]
    if input_len > MAX_INPUT_TOKENS:
        raise gr.Error("This question is too long. Shorten it and try again.")
    inputs = inputs.to(model.device)

    with torch.inference_mode():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=False,
            repetition_penalty=1.1,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.pad_token_id,
        )

    generated_ids = output_ids[0][input_len:]
    response = tokenizer.decode(generated_ids, skip_special_tokens=True)
    stopped_at_limit = (
        len(generated_ids) >= max_tokens
        and int(generated_ids[-1]) != tokenizer.eos_token_id
    )
    return finish_response(response, stopped_at_limit)


with gr.Blocks(title="KIT AI — Medical Reference", analytics_enabled=False) as demo:
    gr.Markdown(
        """
        # KIT AI — Medical Reference

        General health information and first-aid guidance from the KIT AI model.
        This model has not had a formal clinical evaluation. It can make mistakes
        and cannot diagnose a condition or replace professional care.

        **In an emergency, contact your local emergency services immediately.**

        Questions entered here are sent to Hugging Face for processing. Avoid
        including names or other identifying information.
        """
    )
    question_input = gr.Textbox(
        label="Your question",
        placeholder="Ask a first-aid or general health question…",
        lines=3,
        max_length=16000,
    )
    with gr.Accordion("Response settings", open=False):
        num_sentences = gr.Slider(
            minimum=1, maximum=10, value=6, step=1,
            label="Preferred response length (sentences)",
            info="Important steps may require a longer answer.",
        )
        max_tokens = gr.Slider(
            minimum=64, maximum=1024, value=512, step=64,
            label="Response token limit",
        )
    submit_btn = gr.Button("Ask KIT AI", variant="primary")
    output = gr.Textbox(label="General guidance", lines=10, buttons=["copy"])
    gr.Examples(
        examples=[
            ["How should someone clean a small scrape?"],
            ["What should a home first-aid kit contain?"],
            ["What are the warning signs of dehydration?"],
        ],
        inputs=question_input,
    )
    submit_btn.click(
        fn=ask, inputs=[question_input, num_sentences, max_tokens],
        outputs=output, api_name="ask", concurrency_limit=1,
        concurrency_id="medical-model",
    )
    question_input.submit(
        fn=ask, inputs=[question_input, num_sentences, max_tokens],
        outputs=output, api_name="ask_submit", concurrency_limit=1,
        concurrency_id="medical-model",
    )

if __name__ == "__main__":
    demo.queue(max_size=16).launch(theme=gr.themes.Soft())
